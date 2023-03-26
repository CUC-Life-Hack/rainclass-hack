import { window, Hack as HackBase, Cookie, Utils, Ajax, Media } from '@cuclh/userscript-base';
import * as _ from 'lodash';

async function GetMediaDurationByURL(tag, url) {
	let el = document.createElement(tag);
	let duration = null;
	try {
		duration = await Promise.race([
			new Promise(resolve => el.addEventListener('error', err => resolve(Promise.reject(err)))),
			new Promise(res => {
				el.addEventListener('loadedmetadata', ev => res(Promise.resolve(ev.srcElement.duration)));
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
};

class Hack extends HackBase {
	static instance: Hack = null;

	#autoRunning = false;
	user: {
		user_id: any;
		[key: string]: any;
	};
	basicInfo: {
		classroomID: string;
		cardID: string;
		classID?: string;
	};
	slides: any[] = [];
	videos: any[] = [];

	get currentSlideIndex(): number {
		const $slide = window.document.querySelector('.swiper-slide-active') as HTMLElement;
		if(!$slide)
			return NaN;
		return +($slide.querySelector('.page') as HTMLElement).innerText;
	}
	get userID(): string {
		return this.user.user_id;
	}
	get videoElement(): HTMLVideoElement {
		return window.document.querySelector('.xt_video_player_wrap video') as HTMLVideoElement;
	}

	async FetchBasicInfo() {
		const href = window.location.href;
		// CUC 的完整格式
		try {
			const urlMatch = href.match(
				/studentCards\/(\d+)\/(\d+)\/\d+\?.*cid=(\d+)/
			);
			const [, classroomID, cardID, classID] = urlMatch.map(_ => _.toString());
			this.basicInfo = { classroomID, cardID, classID };
			return;
		}
		catch(e) {
			console.error(e);
			this.panel.Log(`无法以完整格式获取课程信息：${e}`, 'warning');
		}
		// 张家口某校的格式，无 class ID
		try {
			const urlMatch = href.match(
				/web\/xcloud\/video-student\/(\d+)\/(\d+)/
			);
			const [, classroomID, cardID] = urlMatch.map(_ => _.toString());
			this.basicInfo = { classroomID, cardID };
			return;
		}
		catch(e) {
			console.error(e);
			this.panel.Log(`无法以 xcloud 格式获取课程信息：${e}`, 'warning');
		}
		throw new Error();
	}

	async FetchSlidesInfo() {
		this.videos = [];
		let rawSlides = JSON.parse(await new Ajax(
			`/v2/api/web/cards/detlist/${this.basicInfo.cardID}?classroom_id=${this.basicInfo.classroomID}`,
			'GET'
		).Post()).data.Slides;
		rawSlides = rawSlides.map(async raw => {
			const slide = {
				index: raw.PageIndex,
				videos: [],
			};
			slide.videos = await Promise.all(raw.Shapes
				.filter(shape => _.has(shape, 'playurl'))
				.map(async (video, vi) => {
					this.panel.Log(`Fetching video info ${slide.index}-${vi}`);
					const duration = await GetMediaDurationByURL('video', video.playurl);
					this.panel.Log(`Video info ${slide.index}-${vi} fetched`);
					video.length = duration;
					video.slideIndex = slide.index;
					this.videos.push(video);
					return video;
				})
			);
			return slide;
		});
		this.slides = await Promise.all(rawSlides);
	}

	async Init() {
		try {
			this.panel.Log('Fetching basic info');
			await this.FetchBasicInfo();
		} catch(e) {
			this.panel.Log(`Error when fetching basic info: ${e + ''}`, 'warning');
			throw e;
		}
		this.panel.Log('Basic info fetched');

		try {
			this.panel.Log('Fetching slides info');
			await this.FetchSlidesInfo();
			this.panel.Log('Slides fetched');
		} catch(e) {
			this.panel.Log(`Error when fetching slides info: ${e + ''}`, 'warning');
		}
		this.panel.Log('Slides info fetched');
	}

	async ClearAudios() {
		for(const $bubble of window.document.querySelectorAll(".playerList .bubble") as unknown as Iterable<HTMLElement>) {
			$bubble.click();
			await Utils.Delay(100);
		}
	}

	MakeHeartbeat(type, video, watchTime, timestamp) {
		return {
			c: this.basicInfo.classID,
			cards_id: this.basicInfo.cardID,
			cc: '',
			classroomid: this.basicInfo.classroomID,
			cp: +watchTime,
			d: video.length,
			et: type,
			fp: 0,
			i: 5,
			lob: 'ykt',
			n: 'ali-cdn.xuetangx.com',
			p: 'web',
			pg: `${this.basicInfo.classID}_qrwx`,
			skuid: '',
			slide: video.slideIndex,
			sp: 1,
			sq: -1,
			t: 'ykt_cards',
			tp: 0,
			ts: timestamp,
			u: this.userID,
			uip: '',
			v: this.basicInfo.classID,
			v_url: video.URL
		};
	}
	async SendHeartbeat(heartbeats) {
		const token = Cookie.get('csrftoken');
		const ajax = new Ajax('/video-log/heartbeat/', 'POST');
		const headers = {
			'Accept': '*/*',
			'Content-Type': 'application/json',
			'classroom-id': this.basicInfo.classroomID,
			'xtbz': 'ykt',
			'X-CSRFToken': token,
			'X-Requested-With': 'XMLHttpRequest'
		};
		for(const [name, value] of Object.entries(headers))
			ajax.header.set(name, value);
		const payload = JSON.stringify({
			heart_data: heartbeats
		});
		ajax.payload = payload;
		return await ajax.Post();
	}

	async ClearVideo(video) {
		const videoLength = video.length;
		const now = +new Date(), startTimestamp = now - videoLength * 1000;
		const heartbeats = [
			this.MakeHeartbeat('loadstart', video, 0, startTimestamp),
			this.MakeHeartbeat('seeking', video, 0, startTimestamp),
			...[
				...Array(Math.floor(videoLength / 5))
					.fill(0)
					.map((_, i) => 5 * i),
				videoLength
			].map(t => this.MakeHeartbeat(
				'playing', video, t, startTimestamp + t * 1000
			)),
			this.MakeHeartbeat('pause', video, videoLength, now),
			this.MakeHeartbeat('videoend', video, videoLength, now),
		];
		heartbeats.forEach((hb, i) => hb.sq = i + 1);
		const raw = await this.SendHeartbeat(heartbeats);
		const result = JSON.parse(raw);
		console.log(heartbeats, result);
	}
	async ClearVideosInSlide(slide) {
		for(const video of slide.videos)
			await this.ClearVideo(video);
	}

	HijackVideoApis() {
		Object.defineProperty(HTMLVideoElement.prototype, 'playbackRate', {
			get(): number { return 1; },
			set: (value: number) => {},
		});
		const currentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
		Object.defineProperty(HTMLVideoElement.prototype, 'currentTime', {
			get(): number { return currentTime.get.call(this); },
			set: (value: number) => {
				console.log('页面试图更新视频进度，已拦截');
			},
		});
		this.panel.Log(`已劫持视频 API`);
	}
	PlayVideo() {
		this.videoElement?.play();
	}
	PauseVideo() {
		this.videoElement?.pause();
	}
	BoostVideoPlaybackRate() {
		const video = this.videoElement;
		if(!video) {
			this.panel.Log('没有视频可以加速', 'warning');
			return;
		}
		const rate = Media.BoostVideoPlaybackRate(video);
		this.panel.Log(`已将视频加速至 ${rate}x`);
	}

	async AutoRun() {
		while(this.#autoRunning) {
			const nextPageLabel = window.document.querySelector('.flag.noRead') as HTMLElement;
			if(!nextPageLabel)
				break;
			nextPageLabel.click();
			await Utils.Delay(100);
			const currentSlide = (window.document.querySelector('.swiper-slide-active .page')  as HTMLElement)?.innerText;
			const slide = this.slides.find(slide => slide.index == currentSlide);
			if(!slide)
				throw new Error('找不到页面');
			await this.ClearAudios();
			await this.ClearVideosInSlide(slide);
			await Utils.Delay(100);
		}
		this.#autoRunning = false;
	}
	BeginAutoRun() {
		this.#autoRunning = true;
		this.AutoRun();
	}
	StopAutoRun() {
		this.#autoRunning = false;
	}

	constructor() {
		super();
		Hack.instance = this;

		this.life.on('start', async () => {
			this.panel.title = '雨课堂 Hack';

			this.user = JSON.parse(
				await new Ajax('/api/web_lesson/user_info/', 'GET').Post()
			).data;
		});

		this.life.on('urlchange', async () => {
			this.panel.Clear();

			await this.Init();

			this.panel.Header('UI 层操作');
			this.panel.Button('清除页面内语音', () => this.ClearAudios());
			this.panel.Button('播放视频', () => this.PlayVideo());
			this.panel.Button('暂停视频', () => this.PauseVideo());
			
			this.panel.Header('视频高级操作');
			const enableAfterHijack: HTMLButtonElement[] = [];
			const hijacker = this.panel.Button('劫持视频 API', () => {
				this.BoostVideoPlaybackRate();
				enableAfterHijack.forEach(b => b.disabled = false);
				hijacker.disabled = true;
			});
			enableAfterHijack.push(this.panel.Button('视频加速', () => this.BoostVideoPlaybackRate()));
			enableAfterHijack.forEach(b => b.disabled = true);
			this.panel.NewLine();

			this.panel.Header('自动化');
			this.panel.Button('自动', () => this.BeginAutoRun()).disabled = true;
			this.panel.Button('停止自动', () => this.StopAutoRun()).disabled = true;
			this.panel.NewLine();
			
			this.panel.Header('数据层操作');
			this.panel.Button('看完当页视频（伪造心跳包）', async () => {
				const video = this.videos.find(v => v.slideIndex == this.currentSlideIndex);
				if(!video) {
					this.panel.Log('当前页面没有视频', 'warning');
					return;
				}
				try {
					await this.ClearVideo(video);
				}
				catch(e) {
					this.panel.Log(e + '', 'warning');
					console.error(e);
				}
			}).disabled = true;
		});
	}
}

new Hack();