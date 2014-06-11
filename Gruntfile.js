module.exports = function ( grunt ){

  grunt.initConfig({
    dustin: {
      // set global values for path resolution
      options: {
        // this prefixes partial lookup to shorten referencing
        resolve: "test/",
        setup: function( adapter, dust ){
          // whatever you want to do with dust before anything happens,
          // do it here
        }
      },
      copyClientLibs: {
        options: {
          // if the client option is present, every other is ignored
          // and client side libraries are copied to this dir
          copy: "test/out/js/",
          // set path resolution to client template loading
          // templates will attempt to load from this dir
          // example: {>"elements/message"/}
          // will load from template/elements/message.js
          resolve: "template/",
          helpers: "test/helpers/client/*.js",
          dustinHelpers: true,
          dustHelpers: true
        }
      },
      render: {
        options: {
          // this target renders html files
          render: true,
          // Dust removes white space by default. Don't do that now.
          preserveWhiteSpace: true,
          // create a global context from these json files
          // file names will be global properties
          data: "test/data/*.json",
          // execute these js files and let them register helpers
          helpers: "test/helpers/node/*.js",
          // this keeps the cache clear
          cache: false
        },
        expand: true,
        cwd: "test/page",
        src: "*.dust",
        dest: "test/out/",
        ext: ".html"
      },
      compile: {
        options: {
          // this target compiles js files
          compile: true,
          // we don't care about white space in compiled templates
          preserveWhiteSpace: false
        },
        expand: true,
        cwd: "test/",
        src: "elements/*.dust",
        dest: "test/out/template/",
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
          "test/out/template/elements.js": "test/elements/*.dust"
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