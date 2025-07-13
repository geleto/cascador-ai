const path = require('path');

module.exports = [
  // CommonJS bundle
  {
    entry: './src/index.ts',
    mode: 'production',
    target: 'node',
    output: {
      path: path.resolve(__dirname, 'dist/cjs'),
      filename: 'index.js',
      library: {
        type: 'commonjs2'
      },
      sourceMapFilename: 'index.js.map',
      clean: true,
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                declaration: false,
                declarationMap: false
              }
            }
          },
          exclude: /node_modules/
        }
      ]
    },
    externals: {
      'ai': 'ai',
      'cascada-engine': 'cascada-engine'
    }
  },

  // ES Module bundle
  {
    entry: './src/index.ts',
    mode: 'production',
    target: 'node',
    output: {
      path: path.resolve(__dirname, 'dist/esm'),
      filename: 'index.js',
      library: {
        type: 'module'
      },
      sourceMapFilename: 'index.js.map',
      clean: true,
    },
    experiments: {
      outputModule: true
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                declaration: false,
                declarationMap: false
              }
            }
          },
          exclude: /node_modules/
        }
      ]
    },
    externals: {
      'ai': 'ai',
      'cascada-engine': 'cascada-engine'
    }
  }
];