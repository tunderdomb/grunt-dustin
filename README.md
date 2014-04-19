grunt-dustin
============

Better templating with LinkedIn's Dust fork for grunt

right now, Dust is unusable in modern versions of Node
because [this line](https://github.com/akdubya/dustjs/blob/master/lib/server.js#L6)
throws
```
Error: require.paths is removed. Use node_modules folders, or the NODE_PATH environment variable instead
```
the [related issue](https://github.com/akdubya/dustjs/pull/62) is a whole year old now
but [linkedin picked up the project](https://github.com/linkedin/dustjs)
and their fork seems to be even better and improved than the original


## Grunt task

### options

#### options.client

Type: `String`

Default: `""`

A directory path where to copy the client side libs.

#### options.render

Type: `Boolean`

Default: `true`

Render files with the given context.

#### options.compile

Type: `Boolean`

Default: `false`

Precompile files into javascript.

#### options.data

Type: `String`

Default: `""`

A globbing pattern that collects `*.json` files.

These will be merged into a global context and will be passed to each template.
The file names will be used for root field names.

#### options.resolve

Type: `String`

Default: `""`

The path part that will be ignored when looking up partials.

If you match partials `"nested/folder/partials/*.mustache"`
you would have to refer partials in your templates with their full path: `{{>nested/folder/partials/apartial}}`
With this option, you can set a path part that will be excluded from partial resolution.
E.g. `partialsRoot: "nested/folder/partials/"`. Now you can just refer to templates as `{{>apartial}}`

#### options.partials

Type: `String`

Default: `""`

A globbing pattern that collects template files.
The pattern is relative to the `resolve` options.

Include/import/partial paths will be looked among these files.

#### options.cache

Type: `Boolean`

Default: `false`

Embrace loads template files once and returns the same content every time it is requested if this option is true.
False by default, because the main reason of this module is to use it with a watch task.

#### options.setup

Type: `Function`

Default: `null`

A function receiving the template adapter and the embrace object `setup(Adapter adapter, Object embrace)`

### Compile

```js

  grunt.initConfig({
    embrace: {
      options: {
        client: "test/embrace/",
        data: "test/data/*.json",
        resolve: "test/partials/",
        partials: "**/*.dust",
        cache: false,
        setup: function( adapter, dust ){}
      },
      compileDust: {
        options: {compile: true},
        expand: true,
        cwd: "test/",
        src: ["**/*.dust"],
        dest: "test/compiled/",
        ext: ".js"
      },
      compileAndConcat: {
        options: {
          compile: true,
          concat: true
        },
        files: {
          "test/compiled/partials.dust.js": "test/partials/**/*.dust",
          "test/compiled/templates.dust.js": "test/templates/**/*.dust"
        }
      }
    }
  })

```

### Render

```js

  grunt.initConfig({
    embrace: {
      options: {
        client: "test/embrace/",
        data: "test/data/*.json",
        helpers: "test/helpers/dust/*.js",
        resolve: "test/partials/",
        partials: "**/*.dust",
        setup: function( adapter, dust ){}
      }
      render: {
        options: {render: true},
        expand: true,
        cwd: "test/templates",
        src: ["*.dust"],
        dest: "test/rendered/"
      }
    }
  })

```

## Licence

MIT