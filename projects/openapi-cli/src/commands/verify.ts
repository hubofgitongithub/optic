import { Command } from 'commander';
import Path from 'path';
import path from 'path';
import * as fs from 'fs-extra';

import { createCommandFeedback, InputErrors } from './reporters/feedback';
import { trackCompletion } from '../segment';
import { trackWarning } from '../sentry';
import * as AT from '../lib/async-tools';
import { readDeferencedSpec } from '../specs';
import { CapturedInteractions, HarEntries } from '../captures';
import { captureStorage } from '../captures/capture-storage';
import chalk from 'chalk';
import {
  addIfUndocumented,
  matchInteractions,
  observationToUndocumented,
  StatusObservationKind,
  StatusObservations,
} from './diffing/document';
import {
  patchOperationsAsNeeded,
  renderDiffs,
  updateByInteractions,
} from './diffing/patch';

export async function verifyCommand({
  addUsage,
}: {
  addUsage: string;
}): Promise<Command> {
  const command = new Command('verify');
  const feedback = await createCommandFeedback(command);

  command
    .description('match observed traffic up to an OpenAPI spec')
    .argument(
      '<openapi-file>',
      'an OpenAPI spec to match up to observed traffic'
    )
    .option('--har <har-file>', 'path to HttpArchive file (v1.2, v1.3)')
    .option('--exit0', 'always exit 0')
    .option('--document <operations>', 'HTTP method and path pair(s) to add')
    .option('--patch', 'Patch existing operations to resolve diffs')
    .action(async (specPath) => {
      const absoluteSpecPath = Path.resolve(specPath);
      if (!(await fs.pathExists(absoluteSpecPath))) {
        return await feedback.inputError(
          'OpenAPI specification file could not be found',
          InputErrors.SPEC_FILE_NOT_FOUND
        );
      }

      console.log('');
      const options = command.opts();

      const makeInteractionsIterator = async () =>
        getInteractions(options, specPath, feedback);

      /// Add if --document or --update options passed
      if (options.document || options.patch) {
        if (options.document) {
          const specReadResult = await readDeferencedSpec(absoluteSpecPath);
          if (specReadResult.err) {
            await feedback.inputError(
              `OpenAPI specification could not be fully resolved: ${specReadResult.val.message}`,
              InputErrors.SPEC_FILE_NOT_READABLE
            );
          }
          const { jsonLike: spec, sourcemap } = specReadResult.unwrap();

          feedback.notable('Documenting operations...');

          let { observations } = matchInteractions(
            spec,
            await makeInteractionsIterator()
          );

          const result = await addIfUndocumented(
            options.document,
            observations,
            await makeInteractionsIterator(),
            spec,
            sourcemap
          );

          if (result.ok) {
            result.val.map((operation) => {
              console.log(
                `${chalk.green('added')}  ${operation.method} ${
                  operation.pathPattern
                }`
              );
            });
          }
        }

        if (options.patch) {
          feedback.notable('Patching operations...');
          const specReadResult = await readDeferencedSpec(absoluteSpecPath);
          if (specReadResult.err) {
            await feedback.inputError(
              `OpenAPI specification could not be fully resolved: ${specReadResult.val.message}`,
              InputErrors.SPEC_FILE_NOT_READABLE
            );
          }
          const { jsonLike: spec, sourcemap } = specReadResult.unwrap();
          const patchInteractions = await makeInteractionsIterator();
          await patchOperationsAsNeeded(patchInteractions, spec, sourcemap);
        }

        console.log(chalk.gray('-'.repeat(process.stdout.columns) + '\n'));
      }

      /// Run to verify with the latest specification
      const specReadResult = await readDeferencedSpec(absoluteSpecPath);
      if (specReadResult.err) {
        await feedback.inputError(
          `OpenAPI specification could not be fully resolved: ${specReadResult.val.message}`,
          InputErrors.SPEC_FILE_NOT_READABLE
        );
      }

      const { jsonLike: spec, sourcemap } = specReadResult.unwrap();

      const interactions = await makeInteractionsIterator();

      feedback.notable('Verifying API behavior...');

      let { results: updatePatches, observations: updateObservations } =
        updateByInteractions(spec, interactions);

      const diffResults = await renderDiffs(sourcemap, spec, updatePatches);

      let { observations, coverage } = matchInteractions(
        spec,
        await makeInteractionsIterator()
      );

      const renderingStatus = await renderOperationStatus(
        observations,
        feedback,
        {
          addUsage,
        }
      );

      const coverageStats = coverage.calculateCoverage();

      console.log('\n ' + chalk.bold.underline(`API Behavior Report`));
      console.log(`
 Total Requests          : ${coverageStats.totalRequests}
 Diffs                   : ${diffResults.shapeDiff}
 Undocumented operations : ${renderingStatus.undocumentedPaths}
 Undocumented bodies     : ${renderingStatus.undocumentedPaths}\n`);

      coverage.renderCoverage();

      const hasDiff =
        diffResults.totalDiffCount + renderingStatus.undocumentedPaths > 0;
      if (!options.exit0 && hasDiff) {
        console.log(
          chalk.red('OpenAPI and implementation are out of sync. Exiting 1')
        );
        process.exit(1);
      }
      if (!hasDiff) {
        console.log(
          chalk.green.bold(
            'No diffs detected. OpenAPI and implementation appear to be in sync.'
          )
        );
      }
    });

  return command;
}

async function renderOperationStatus(
  observations: StatusObservations,
  feedback: Awaited<ReturnType<typeof createCommandFeedback>>,
  { addUsage }: { addUsage: string }
) {
  const { pathsToAdd } = await observationToUndocumented(observations);

  let undocumentedPaths: number = 0;

  if (pathsToAdd.length) {
    for (let unmatchedPath of pathsToAdd) {
      undocumentedPaths++;
      unmatchedPath.methods.forEach((method) =>
        renderUndocumentedPath(method.toUpperCase(), unmatchedPath.pathPattern)
      );
    }
    feedback.commandInstruction('--document all', 'to document these paths');
    feedback.commandInstruction(
      `--document "[method path], ..."`,
      'to document or more paths'
    );
  }

  return { undocumentedPaths };
  function operationId({ path, method }: { path: string; method: string }) {
    return `${method}${path}`;
  }
}

async function trackStats(observations: StatusObservations) {
  const stats = {
    unmatchedPathsCount: 0,
    unmatchedMethodsCount: 0,

    capturedInteractionsCount: 0,
    matchedInteractionsCount: 0,
  };

  await trackCompletion('openapi_cli.status', stats, async function* () {
    for await (let observation of observations) {
      if (observation.kind === StatusObservationKind.InteractionUnmatchedPath) {
        stats.unmatchedPathsCount += 1;
        yield stats;
      } else if (
        observation.kind === StatusObservationKind.InteractionUnmatchedMethod
      ) {
        stats.unmatchedMethodsCount += 1;
        yield stats;
      } else if (
        observation.kind === StatusObservationKind.InteractionCaptured
      ) {
        stats.capturedInteractionsCount += 1;
        yield stats;
      } else if (
        observation.kind === StatusObservationKind.InteractionMatchedOperation
      ) {
        stats.matchedInteractionsCount += 1;
        yield stats;
      }
    }
  });
}

async function getInteractions(
  options: { har?: string },
  specPath: string,
  feedback: any
) {
  const sources: CapturedInteractions[] = [];

  const [, captureStorageDirectory] = await captureStorage(specPath);

  const captureDirectoryContents = (
    await fs.readdir(captureStorageDirectory)
  ).sort();

  // if HAR provided, only pullf rom there
  if (options.har) {
    // override with a har
    let absoluteHarPath = Path.resolve(options.har);
    if (!(await fs.pathExists(absoluteHarPath))) {
      return await feedback.inputError(
        'HAR file could not be found at given path',
        InputErrors.HAR_FILE_NOT_FOUND
      );
    }
    let harFile = fs.createReadStream(absoluteHarPath);
    let harEntryResults = HarEntries.fromReadable(harFile);
    let harEntries = AT.unwrapOr(harEntryResults, (err) => {
      let message = `HAR entry skipped: ${err.message}`;
      console.warn(message); // warn, skip and keep going
      trackWarning(message, err);
    });
    sources.push(CapturedInteractions.fromHarEntries(harEntries));
  } else {
    // default is capture directory
    captureDirectoryContents.forEach((potentialCapture) => {
      // completed captures only
      if (potentialCapture.endsWith('.har')) {
        let harFile = fs.createReadStream(
          path.join(captureStorageDirectory, potentialCapture)
        );
        let harEntryResults = HarEntries.fromReadable(harFile);
        let harEntries = AT.unwrapOr(harEntryResults, (err) => {
          let message = `HAR entry skipped: ${err.message}`;
          console.warn(message); // warn, skip and keep going
          trackWarning(message, err);
        });

        sources.push(CapturedInteractions.fromHarEntries(harEntries));
      }
    });
  }

  if (sources.length < 1) {
    return await feedback.inputError(
      'no traffic captured for this OpenAPI spec. Run "oas capture" command',
      InputErrors.CAPTURE_METHOD_MISSING
    );
  }

  return AT.merge(...sources);
}

function renderUndocumentedPath(method: string, pathPattern: string) {
  console.log(
    `${chalk.bgYellow('Undocumented')} ${method
      .toUpperCase()
      .padStart(6, ' ')}   ${pathPattern}`
  );
}