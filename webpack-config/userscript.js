import WebpackUserscript from 'webpack-userscript';

export default new WebpackUserscript({
	headers: {
		name: '[userscript-name]',
		version: '0.0.1',
		grant: ['unsafeWindow'],
		include: '*://*.*'
	},
	downloadBaseUrl: 'https://github.com/CUC-Life-Hack/[repo-name]/raw/master/dist/main.user.js',
	metajs: false,
	renameExt: true,
	pretty: true,
});