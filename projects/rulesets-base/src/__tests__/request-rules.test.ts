import { defaultEmptySpec, OpenAPIV3 } from '@useoptic/openapi-utilities';
import { RuleError } from '../errors';
import { RuleRunner } from '../rule-runner';
import { RequestRule } from '../rules';
import { createRuleInputs } from './helpers';

describe('RequestRule', () => {
  describe('matches', () => {
    const json: OpenAPIV3.Document = {
      ...defaultEmptySpec,
      paths: {
        '/api/users': {
          get: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {},
                },
              },
            },
            responses: {},
          },
        },
        '/api/users/{userId}': {
          get: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {},
                },
                'application/xml': {
                  schema: {},
                },
              },
            },
            responses: {},
          },
        },
      },
    };

    test('match operation', () => {
      const mockFn = jest.fn();
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request',
          matches: (request, ruleContext) =>
            ruleContext.operation.method === 'get' &&
            ruleContext.operation.path === '/api/users',
          rule: (requestAssertions) => {
            requestAssertions.body.requirement('triggers test', mockFn);
          },
        }),
      ]);
      ruleRunner.runRulesWithFacts(createRuleInputs(json, json));

      expect(mockFn.mock.calls.length).toBe(1);
      const requestFromCallArg = mockFn.mock.calls[0][0];
      expect(requestFromCallArg.contentType).toBe('application/json');
      expect(requestFromCallArg.location.jsonPath).toBe(
        '/paths/~1api~1users/get/requestBody/content/application~1json'
      );
    });

    test('match request with content type', () => {
      const mockFn = jest.fn();
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request',
          matches: (request) => request.contentType === 'application/xml',
          rule: (requestAssertions) => {
            requestAssertions.body.requirement('triggers test', mockFn);
          },
        }),
      ]);
      ruleRunner.runRulesWithFacts(createRuleInputs(json, json));

      expect(mockFn.mock.calls.length).toBe(1);
      const requestFromCallArg = mockFn.mock.calls[0][0];
      expect(requestFromCallArg.contentType).toBe('application/xml');
      expect(requestFromCallArg.location.jsonPath).toBe(
        '/paths/~1api~1users~1{userId}/get/requestBody/content/application~1xml'
      );
    });
  });

  describe('body assertions', () => {
    describe('requirement', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request type',
          rule: (requestAssertions) => {
            requestAssertions.body.requirement(
              'must contain a type',
              (request) => {
                if (!request.value.flatSchema.type) {
                  throw new RuleError({
                    message: 'request body does not have `type`',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'string',
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(json, json)
        );
        expect(results).toMatchSnapshot();
        expect(results.length > 0).toBe(true);
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {},
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(json, json)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });

    describe('added', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request type',
          rule: (requestAssertions) => {
            requestAssertions.body.added('must contain a type', (request) => {
              if (!request.value.flatSchema.type) {
                throw new RuleError({
                  message: 'request does not have `type`',
                });
              }
            });
          },
        }),
      ]);

      test('passing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'string',
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(defaultEmptySpec, json)
        );
        expect(results.length > 0).toBe(true);

        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {},
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(defaultEmptySpec, json)
        );
        expect(results.length > 0).toBe(true);

        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });

    describe('changed', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request shape',
          rule: (requestAssertions) => {
            requestAssertions.body.changed(
              'must not change root body shape',
              (before, after) => {
                if (
                  before.value.flatSchema.type !== after.value.flatSchema.type
                ) {
                  throw new RuleError({
                    message: 'request must not change type',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        description: '123',
                        items: {
                          type: 'string',
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        description: 'abc',
                        items: {
                          type: 'number',
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {},
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });

    describe('removed', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request removal',
          rule: (requestAssertions) => {
            requestAssertions.body.removed(
              'cannot remove bodies with array schema',
              (request) => {
                if (request.value.flatSchema.type === 'array') {
                  throw new RuleError({
                    message: 'cannot remove bodies with array schema',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'string',
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });
  });

  describe('property assertions', () => {
    describe('requirement', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request type',
          rule: (requestAssertions) => {
            requestAssertions.property.requirement(
              'must contain a type',
              (property) => {
                if (!property.value.flatSchema.type) {
                  throw new RuleError({
                    message: 'field does not have `type`',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'hello',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            hello: {},
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(json, json)
        );
        expect(results).toMatchSnapshot();
        expect(results.length > 0).toBe(true);
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {},
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(json, json)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });

    describe('added', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request type',
          rule: (requestAssertions) => {
            requestAssertions.property.requirement(
              'must contain a type',
              (property) => {
                if (!property.value.flatSchema.type) {
                  throw new RuleError({
                    message: 'field does not have `type`',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(defaultEmptySpec, json)
        );
        expect(results.length > 0).toBe(true);

        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const json: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {},
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(defaultEmptySpec, json)
        );
        expect(results.length > 0).toBe(true);

        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });

    describe('changed', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'property type',
          rule: (requestAssertions) => {
            requestAssertions.property.changed(
              'must not change property type',
              (before, after) => {
                if (
                  before.value.flatSchema.type !== after.value.flatSchema.type
                ) {
                  throw new RuleError({
                    message: 'must not change type',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        description: '123',
                        items: {
                          type: 'object',
                          properties: {
                            hello: {
                              type: 'string',
                              format: 'uuid',
                            },
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        description: '123',
                        items: {
                          type: 'object',
                          properties: {
                            hello: {
                              type: 'string',
                              format: 'date',
                            },
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        description: '123',
                        items: {
                          type: 'object',
                          properties: {
                            hello: {
                              type: 'string',
                              format: 'uuid',
                            },
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        description: '123',
                        items: {
                          type: 'object',
                          properties: {
                            hello: {
                              type: 'number',
                            },
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });

    describe('removed', () => {
      const ruleRunner = new RuleRunner([
        new RequestRule({
          name: 'request removal',
          rule: (requestAssertions) => {
            requestAssertions.property.removed(
              'cannot remove bodies required property',
              (property) => {
                if (property.value.required) {
                  throw new RuleError({
                    message: 'cannot remove bodies with array schema',
                  });
                }
              }
            );
          },
        }),
      ]);

      test('passing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {
                            type: 'string',
                          },
                          goodbye: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      });

      test('failing assertion', () => {
        const before: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['goodbye'],
                        properties: {
                          hello: {
                            type: 'string',
                          },
                          goodbye: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const after: OpenAPIV3.Document = {
          ...defaultEmptySpec,
          paths: {
            '/api/users': {
              get: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          hello: {
                            type: 'string',
                          },
                        },
                      },
                    },
                  },
                },
                responses: {},
              },
            },
          },
        };
        const results = ruleRunner.runRulesWithFacts(
          createRuleInputs(before, after)
        );
        expect(results.length > 0).toBe(true);
        expect(results).toMatchSnapshot();
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
      });
    });
  });
});