import { OpticCliConfig } from '../../config';
import { StandardRulesets } from '@useoptic/standard-rulesets';
import { RuleRunner, Ruleset, RulesetConfig } from '@useoptic/rulesets-base';
import { createOpticClient } from '@useoptic/optic-ci/build/cli/clients/optic-client';

const isLocalJsFile = (name: string) => name.endsWith('.js');

type InputPayload = Parameters<typeof RulesetConfig.prepareRulesets>[0];

export const generateRuleRunner = async (
  config: OpticCliConfig,
  checksEnabled: boolean
): Promise<RuleRunner> => {
  let rulesets: Ruleset[] = [];

  if (checksEnabled) {
    const client = createOpticClient('');

    const rulesToFetch: string[] = [];
    const localRulesets: InputPayload['localRulesets'] = {};
    const hostedRulesets: InputPayload['hostedRulesets'] = {};
    for (const rule of config.ruleset) {
      if (rule.name in StandardRulesets) {
        continue;
      } else if (isLocalJsFile(rule.name)) {
        localRulesets[rule.name] = rule.name; // the path is the name
      } else {
        rulesToFetch.push(rule.name);
      }
    }
    const response = await client.getManyRulesetsByName(rulesToFetch);
    for (const hostedRuleset of response.rulesets) {
      if (hostedRuleset) {
        hostedRulesets[hostedRuleset.name] = {
          uploaded_at: hostedRuleset.uploaded_at,
          url: hostedRuleset.url,
        };
      }
    }

    const results = await RulesetConfig.prepareRulesets({
      ruleset: config.ruleset,
      localRulesets,
      standardRulesets: StandardRulesets,
      hostedRulesets,
    });

    rulesets = results.rulesets;
    for (const warning of results.warnings) {
      console.error(warning);
    }
  }

  return new RuleRunner(rulesets);
};