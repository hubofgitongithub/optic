# Generate OpenAPI from tests
![GitHub Repo stars](https://img.shields.io/github/stars/opticdev/optic?style=social) ![GitHub contributors](https://img.shields.io/github/contributors-anon/opticdev/optic?style=social) ![npm](https://img.shields.io/npm/dm/@useoptic/openapi-io?style=social) ![license](https://img.shields.io/github/license/opticdev/optic?style=social)

Run API tests through a local proxy that generates accurate OpenAPI documentation. When new endpoints are added or existing API behavior changes, the proxy updates the OpenAPI for you so it is always up-to-date. 


https://github.com/opticdev/optic/assets/5900338/e3497023-d303-4265-9c28-ce124ca746e3

# Install
```bash
npm install -g @useoptic/optic
```
or
```bash
sh -c "$(curl -Ls https://install.useoptic.com/install.sh)"
```

# Setup

**1. Point Optic at an OpenAPI spec**. If none exists, an empty one will be created:

```
optic capture init openapi.yml
```

**2. Connect your tests.** Tell Optic how to run your tests in the `optic.yml` config file: 

`optic.yaml`
```yaml
capture:
  openapi.yml:
    server:
      # hostname of your test server
      url: http://localhost:8080
    requests:
      # the command that runs your test
      command: go test
```

Update your test runner to send traffic through the local proxy. When Optic is running your test command, `$OPTIC_PROXY` (a fully qualified hostname) will be in the environment: 

```
// in your test fixture
const baseUrl = process.env.OPTIC_PROXY || process.env.API_BASE_URL || 'http://localhost:8080'
...

// send test traffic through the local proxy when it is running
fetch(`${baseUrl}/...`)
```

[Full documentation for configuring captures can be found here](https://www.useoptic.com/docs/capturing-traffic)

**3. Run your tests with Optic:**
```
optic capture openapi.yml
```
If `openapi.yml` is an empty OpenAPI file, Optic will help us document the endpoints: 

```
Running tests 'go test'...22 requests captured

5 requests did not match a documented path (5 total requests).

Run 'optic capture openapi.yml --update interactive' to add new endpoints
```


**4. Document API endpoints**

Optic infers the paths in your API based on the traffic. It is pretty good at it, but if you need to override its inference you can. Once a path is added to your specification, it will not ask you about it again: 

```
optic capture openapi.yml --update interactive
```

![alt](https://i.imgur.com/KKNMxsD.jpg)

As you answer the prompts, OpenAPI operations will begin to appear in your OpenAPI specification. The schemas are inferred from the traffic  

![alt](https://i.imgur.com/PK702Zp.jpg)

> **Optic generates:** 
> - OpenAPI 3.0 or 3.1 (depending on the version your set).
> - New `schema.components` when documenting new endpoints.
> - Re-uses existing `schema.components`

**5. Update the documentation**

APIs change. Optic helps you keep up with those changes. Unlike most OpenAPI generators, you can run Optic as many times as you want. It will verify that your API keeps working as-documented, preserve any manual changes you make, and help patch the specification when it is out-of-date.  

```
optic capture openapi.yml
```
![alt](https://i.imgur.com/kDYij8e.jpg)

Cool! Optic exited `1` because it detected an undocumented response property called `location`. You could manually update the schema to get this passing again. Or run `--update` to save time: 

```
optic capture openapi.yml --update
```

![alt](https://i.imgur.com/UeaKSW7.jpg)

> Optic updates your OpenAPI in the correct spot. It works with shared components, and even specs broken into multiple files

---

## Use Cases
1. Quickly document an existing internal API
2. Catch unplanned/accidental API changes in CI to prevent them from shipping
3. Fix the inaccuracies in an existing OpenAPI document. 
4. Start using OpenAPI

## Advanced

### Preserve manual changes 
Most OpenAPI generators overwrite manual changes. Optic will always preserve your schema changes, and the `description`, `summary`, and other metadata fields you write.

If Optic detects the type of `avatar_url` is changed to `string | null`, it will patch the value of `type` without touching the `description`: 
```yaml
avatar_url:
  description: the URL of our user's avatar.
  type: string
```

```yaml
avatar_url:
  description: the URL of our user's avatar.
-  type: string 
+  type: 
+   - string
+   - "null"   
```

### Ignore certain paths
Some HTTP requests will not be part of your API ie. images, css, js. This is often the case for SPAs so Optic supports filtering certain kinds of traffic. We use [minimatch](https://github.com/isaacs/minimatch) to support these glob patterns:  

```yaml
openapi: 3.1.0
x-optic-path-ignore:
  - "**/*.+(ico|png|jpeg|jpg|gif)"
  - "/health-check"
```

### Set a base path
If your API operations share a common base path ie `/api` or `/api/v1` you should put that path into `.servers`. This will ignore all other traffic, and generate new paths relative to the base path ie `/users` instead of `/api/users`:
```yaml
openapi: 3.1.0
servers:
  - url: http://localhost:3030/api/v1
    description: Local Development 
  - url: http://api.example.com/api/v1
    description: Production 
```

### `$ref` and splitting OpenAPI definition across multiple files 
Optic fully supports [`$ref`](https://swagger.io/docs/specification/using-ref/). 

This lets you reuse schemas within a file: 
```yaml
type: array
items: 
  $ref: "#/components/schemas/TodoArray"
```
And even between files: 
```yaml
type: array
items: 
  $ref: "./components/schemas/Todo#ReadTodoModel"
```

Optic will keep generating and patching your OpenAPI specification in the correct places. 

### Bring your existing OpenAPI specification 
Optic should work with a valid OpenAPI 3.0 and 3.1 specifications you already have. Teams that write their OpenAPI specifications by hand and work "design-first", use Optic to verify that new API endpoints are build to spec and existing ones don't change.

---


DEMO!

NExt steps!

Help!

