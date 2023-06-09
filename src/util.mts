export async function GetMediaDurationByURL(url): Promise<number> {
	let el = document.createElement('video');
	let duration = null;
	try {
		duration = await Promise.race([
			new Promise(resolve => el.addEventListener('error', err => resolve(Promise.reject(err)))),
			new Promise(res => {
				el.addEventListener('loadedmetadata', () => res(Promise.resolve(el.duration)));
				el.src = url;
			})
		]);
	}
	catch(err) {
		throw err;
	}
	finally {
		el.src = '';
		el.remove();
		el = null;
		return duration;
	}
}