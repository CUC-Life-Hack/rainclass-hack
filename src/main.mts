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

	autoRun = false;
	info: any;
	slides: any[];
	videos: any[];

	get currentSlideIndex(): number {
		const $slide = window.document.querySelector('.swiper-slide-active') as HTMLElement;
		if(!$slide)
			return NaN;
		return +($slide.querySelector('.page') as HTMLElement).innerText;
	}

	async Init() {
		// Info
		const [, classroomID, cardID, classID] = window.location.href.match(
			/studentCards\/(\d+)\/(\d+)\/\d+\?.*cid=(\d+)/
		).map(_ => _.toString());
		const userID = JSON.parse(
			await new Ajax('/api/web_lesson/user_info/', 'GET').Post()
		).data.user_id.toString();
		this.info = { classroomID, cardID, classID, userID };
		this.panel.Log('User info fetched');

		// Slides

		this.videos = [];
		let rawSlides = JSON.parse(await new Ajax(
			`/v2/api/web/cards/detlist/${cardID}?classroom_id=${classroomID}`,
			'GET'
		).Post()).data.Slides;
		this.panel.Log('Slides fetched');
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

		return false;
	}

	async ClearAudios() {
		for(const $bubble of window.document.querySelectorAll(".playerList .bubble") as unknown as Iterable<HTMLElement>) {
			$bubble.click();
			await Utils.Delay(100);
		}
	}

	MakeHeartbeat(type, video, watchTime, timestamp) {
		return {
			c: this.info.classID,
			cards_id: this.info.cardID,
			cc: '',
			classroomid: this.info.classroomID,
			cp: +watchTime,
			d: video.length,
			et: type,
			fp: 0,
			i: 5,
			lob: 'ykt',
			n: 'ali-cdn.xuetangx.com',
			p: 'web',
			pg: `${this.info.classID}_qrwx`,
			skuid: '',
			slide: video.slideIndex,
			sp: 1,
			sq: -1,
			t: 'ykt_cards',
			tp: 0,
			ts: timestamp,
			u: this.info.userID,
			uip: '',
			v: this.info.classID,
			v_url: video.URL
		};
	}
	async SendHeartbeat(heartbeats) {
		const token = Cookie.get('csrftoken');
		const ajax = new Ajax('/video-log/heartbeat/', 'POST');
		const headers = {
			'Accept': '*/*',
			'Content-Type': 'application/json',
			'classroom-id': this.info.classroomID,
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

	BoostVideoPlaybackRate() {
		const video = window.document.querySelector('.xt_video_player_wrap video') as HTMLVideoElement;
		if(!video) {
			this.panel.Log('没有视频可以加速', 'warning');
			return;
		}
		Media.BoostVideoPlaybackRate(video);
		this.panel.Log(`已将视频加速至 ${video.playbackRate}x`);
		Object.defineProperty(video, 'playbackRate', {
			get(): number { return 1; },
			set: (value: number) => {},
		});
	}

	constructor() {
		super();
		Hack.instance = this;

		this.life.on('start', async () => {
			this.panel.title = '雨课堂 Hack';

			await this.Init();
			console.log(this.videos);

			this.panel.Button('自动', async () => {
				this.autoRun = true;
				while(this.autoRun) {
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
				this.autoRun = false;
			});
			this.panel.Button('停止自动', () => {
				this.autoRun = false;
			});
			this.panel.NewLine();

			this.panel.Button('清除页面内语音', () => this.ClearAudios());
			this.panel.NewLine();
			
			this.panel.Button('看完当页视频', async () => {
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
			this.panel.Button('视频加速', () => this.BoostVideoPlaybackRate());
		});
	}
}

new Hack();