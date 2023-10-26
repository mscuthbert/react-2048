const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// const ESLintPlugin = require('eslint-webpack-plugin');

const prod = process.env.NODE_ENV === 'production';

module.exports = {
    mode: prod ? 'production' : 'development',
    entry: './src/index.tsx',
    devtool: prod ? undefined : 'source-map',
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
        }),
        new MiniCssExtractPlugin(),
        // new ESLintPlugin({
        //     extensions: ['tsx'],
        // }),
    ],
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: 'ts-loader',
                resolve: {
                    extensions: ['.tsx', '.ts', '.js', '.json'],
                },
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            },

        ],
    },
    output: {
        path: path.resolve(__dirname, 'dist')
    },
};
