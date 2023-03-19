import path from 'path';
import url from 'url';
import userscript from './userscript.config.js';
import { UserscriptPlugin as WebpackUserscript } from 'webpack-userscript';
import _ from 'lodash';
import * as WebpackDevServer from 'webpack-dev-server';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dev = process.env.NODE_ENV === 'development';

const srcPath = path.resolve(__dirname, './src/main.mts');
const devPath = path.resolve(__dirname, 'dev');
const distPath = path.resolve(__dirname, 'dist');

const distHeader = {
	name: userscript.name,
	version: userscript.version,
	downloadURL: `https://github.com/CUC-Life-Hack/${userscript.repoName}/raw/master/dist/main.user.js`,
	include: userscript.include,
	grant: ['unsafeWindow'],
};
if(dev)
	distHeader.name += ' (dev)';

const devHeader = original => {
	_.assign(original, distHeader);
	return {
		...original,
		version: `${original.version}-build.[buildNo]`,
	};
};

/** @type { WebpackDevServer.Configuration } */
const devServer = {
	port: 8080,
	server: 'http',
};

export default {
	mode: 'production',
	entry: srcPath,
	output: {
		path: dev ? devPath : distPath,
		filename: 'main.js',
		publicPath: '',
	},
	devServer,
	resolve: {
		extensionAlias: {
			'.js': ['.js', '.ts'],
			'.mjs': ['.mjs', '.mts'],
		},
	},
	module: {
		rules: [
			{
				test: /\.[cm]?ts$/,
				loader: 'ts-loader',
				options: {
					allowTsInNodeModules: true,
				},
			},
			{
				test: /\.(css|s[ac]ss)/,
				use: ['style-loader', 'css-loader'],
			},
			{
				test: /\.styl/,
				use: ['style-loader', 'css-loader', 'stylus-loader'],
			},
		],
	},
	plugins: [
		new WebpackUserscript({
			headers: dev ? devHeader : distHeader,
			downloadBaseUrl: userscript.downloadBaseUrl,
			metajs: false,
			renameExt: true,
			pretty: true,
		}),
	],
};
