module.exports = function ( grunt ){

  grunt.initConfig({
    dustin: {
      // set global values for path resolution
      options: {
        resolve: "test/partials/",
        partials: "**/*.dust",
        setup: function( adapter, dust ){}
      },
      copyClientLibs: {
        options: {
          // if the client option is present, every other is ignored
          // copy client libs to this dir
          client: "test/lib/",
          // set path resolution to this path
          // templates will attempt to load from this dir
          // example: {>"nested/partial/go"/}
          // will load from compiled/partials/nested/partial/go.js

          // NOTE: for correct resolution, the compiled templates must use the same resolve roots,
          // so take care setting the resolve and partials options accordingly
          // In a nutshell, the resolve option just lets you define a resolution root
          // so you can refer to templates with a relative path.
          resolve: "compiled/partials/"
        }
      },
      render: {
        options: {
          // this target renders html files
          render: true,
          // Dust removes white space by default. Don't do that.
          preserveWhiteSpace: true,
          // create a global context from these json files
          // file names will be global properties
          data: "test/data/*.json",
          // execute these js files and let them register helpers
          helpers: "test/helpers/*.js"
        },
        expand: true,
        cwd: "test/templates",
        src: ["*.dust"],
        dest: "test/rendered/"
      },
      compile: {
        options: {
          // this task compiles js files
          compile: true,
          // we don't care about white space in compiled templates
          preserveWhiteSpace: false
        },
        expand: true,
        cwd: "test/",
        src: ["**/*.dust"],
        dest: "test/compiled/",
        ext: ".js"
      },
      compileAndConcat: {
        options: {
          preserveWhiteSpace: false,
          compile: true,
          // this one concats compiled files into one
          concat: true
        },
        files: {
          "test/compiled/partials.dust.js": "test/partials/**/*.dust",
          "test/compiled/templates.dust.js": "test/templates/**/*.dust"
        }
      }
    },
    clean: {
      test: {
        src:[
          "test/rendered/**/*",
          "test/compiled/**/*"
        ]
      }
    },
    dir: {
      "src": {
        src: "test/templates/*.*"
      },
      "src-dest": {
        src: "test/templates/*.*",
        dest: "test/rendered"
      },
      "src-expand": {
        expand: true,
        src: "test/templates/*.*"
      },
      "src-dest-expand": {
        expand: true,
        src: "test/templates/*.*",
        dest: "test/rendered"
      },
      "cwd-src-dest-expand": {
        expand: true,
        cwd: "test/templates/",
        src: "*.*",
        dest: "test/rendered"
      },
      relative: {
        expand: true,
        cwd: "test/partials/",
        src: "{layouts,nested}/**/*.dust",
        dest: "test/rendered"
      }
    }
  })

  grunt.loadTasks("tasks")
  grunt.loadNpmTasks("grunt-contrib-clean")

  grunt.registerTask("default", "", function(  ){
    console.log("Grunt~~")
    grunt.task.run("clean:test")
    grunt.task.run("dustin")
  })

  grunt.registerMultiTask("dir", "", function(  ){
    this.files.forEach(function( filePair ){
      filePair.src.forEach(function( src ){
        console.log(src, " -> ", filePair.dest)
      })
    })
  })

};