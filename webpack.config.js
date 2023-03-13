import path from 'path';
import url from 'url';
import userscript from './userscript.config.js';
import WebpackUserscript from 'webpack-userscript';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dev = process.env.NODE_ENV === 'development';

const srcPath = path.resolve(__dirname, './src/main.js');
const devPath = path.resolve(__dirname, 'dev');
const distPath = path.resolve(__dirname, 'dist');

if(dev)
	userscript.name += ' (dev)';

const devHeader = original => {
	return {
		...original,
		version: `${original.version}-build.[buildNo]`,
	};
};
const distHeader = {
	name: userscript.name,
	version: userscript.version,
	grant: userscript.grant,
	include: userscript.include
};

export default {
	mode: dev ? 'development' : 'production',
	entry: srcPath,
	output: {
		path: dev ? devPath : distPath,
		filename: 'main.js'
	},
	devServer: {
		// contentBase: devPath,
	},
	module: {
		rules: [{
			test: /\.(css|s[ac]ss)/,
			use: ['style-loader', 'css-loader', 'sass-loader']
		}]
	},
	plugins: [
		new WebpackUserscript({
			headers: dev ? devHeader : distHeader,
			downloadBaseUrl: userscript.downloadBaseUrl,
			metajs: false,
			renameExt: true,
			pretty: true,
		}),
		new CleanWebpackPlugin()
	]
};
