import { window, Hack as HackBase, Cookie, Utils, Ajax } from '@cuclh/userscript-base';
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
	autoRun = false;
	info: any;
	slides: any[];
	videos: any[];

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
		return await this.SendHeartbeat(heartbeats);
	}
	async ClearVideosInSlide(slide) {
		for(const video of slide.videos)
			await this.ClearVideo(video);
	}

	constructor() {
		super();

		this.life.on('start', async () => {
			this.panel.title = '雨课堂 Hack';

			await this.Init();

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
			this.panel.Button('清除页面内语音', () => this.ClearAudios());
			this.panel.Button('一键看完所有视频', async () => {
				for(const video of this.videos) {
					try {
						const result = await this.ClearVideo(video);
						this.panel.Log(result);
					}
					catch(e) {
						this.panel.Log(e + '', 'warning');
						console.error(e);
					}
				}
			});
		});
	}
}

new Hack();