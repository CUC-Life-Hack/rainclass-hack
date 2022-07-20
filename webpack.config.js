import path from 'path';
import url from 'url';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import WebpackUserscript from 'webpack-userscript';
import _ from 'lodash';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const production = !!process.env['npm_config_production'];

export default {
	mode: production ? 'production' : 'development',
	entry: path.resolve(__dirname, 'main.js'),
	output: {
		path: path.resolve(__dirname, production ? 'dist' : 'dev'),
		filename: 'main.js'
	},
	module: {
		rules: [{
			test: /\.css/,
			use: ['style-loader', 'css-loader']
		}]
	},
	plugins: [
		new WebpackUserscript({
			headers: {
				name: '雨课堂 Hack',
				version: '1.0.3',
				grant: ['unsafeWindow'],
				include: /https:\/\/www\.yuketang\.cn\/v2\/web\/studentCards\/\d+\/\d+\/\d+\?cid=\d+/.toString()
			},
			downloadBaseUrl: 'https://github.com/CUC-Life-Hack/rainclass-hack/raw/master/dist/main.user.js',
			metajs: false,
			renameExt: true,
			pretty: true,
		}),
		new CleanWebpackPlugin()
	]
};
