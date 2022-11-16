import WebpackUserscript from 'webpack-userscript';

export default new WebpackUserscript({
	headers: {
		name: '雨课堂 Hack',
		version: '1.0.4',
		grant: ['unsafeWindow'],
		match: 'https://www.yuketang.cn/v2/web/studentCards/*'
	},
	downloadBaseUrl: 'https://github.com/CUC-Life-Hack/rainclass-hack/raw/master/dist/main.user.js',
	metajs: false,
	renameExt: true,
	pretty: true,
});
