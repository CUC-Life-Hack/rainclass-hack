import { window, $, $$, GetCookie, GetMediaDurationByURL, Hack, Delay, PostAjax } from '@cuclh/userscript-base';
import _ from 'lodash';
import { Button } from '@cuclh/userscript-base/src/layout.js';

_.assign(Hack, {
	header: '雨课堂 Hack',

	autoRun: false,

	async Init() {
		// Info
		const [, classroomID, cardID, classID] = window.location.href.match(
			/studentCards\/(\d+)\/(\d+)\/\d+\?.*cid=(\d+)/
		).map(_ => _.toString());
		const userID = JSON.parse(
			await PostAjax('/api/web_lesson/user_info/', 'GET')
		).data.user_id.toString();
		Hack.info = { classroomID, cardID, classID, userID };
		Hack.panel.Log('User info fetched');

		// Slides

		Hack.videos = [];
		let rawSlides = JSON.parse(await PostAjax(
			`/v2/api/web/cards/detlist/${cardID}?classroom_id=${classroomID}`,
			'GET'
		)).data.Slides;
		Hack.panel.Log('Slides fetched');
		rawSlides = rawSlides.map(async raw => {
			const slide = {
				index: raw.PageIndex
			};
			slide.videos = await Promise.all(raw.Shapes
				.filter(shape => _.has(shape, 'playurl'))
				.map(async (video, vi) => {
					Hack.panel.Log(`Fetching video info ${slide.index}-${vi}`);
					const duration = await GetMediaDurationByURL('video', video.playurl);
					Hack.panel.Log(`Video info ${slide.index}-${vi} fetched`);
					video.length = duration;
					video.slideIndex = slide.index;
					Hack.videos.push(video);
					return video;
				})
			);
			return slide;
		});
		Hack.slides = await Promise.all(rawSlides);

		return false;
	},

	async ClearAudios() {
		for(const $bubble of $$(".playerList .bubble")) {
			$bubble.click();
			await Delay(100);
		}
	},

	MakeHeartbeat(type, video, watchTime, timestamp) {
		return {
			c: Hack.info.classID,
			cards_id: Hack.info.cardID,
			cc: '',
			classroomid: Hack.info.classroomID,
			cp: +watchTime,
			d: video.length,
			et: type,
			fp: 0,
			i: 5,
			lob: 'ykt',
			n: 'ali-cdn.xuetangx.com',
			p: 'web',
			pg: `${Hack.info.classID}_qrwx`,
			skuid: '',
			slide: video.slideIndex,
			sp: 1,
			sq: -1,
			t: 'ykt_cards',
			tp: 0,
			ts: timestamp,
			u: Hack.info.userID,
			uip: '',
			v: Hack.info.classID,
			v_url: video.URL
		};
	},
	async SendHeartbeat(heartbeats) {
		const token = GetCookie('csrftoken');
		return await PostAjax('/video-log/heartbeat/', 'POST',
			{
				'Accept': '*/*',
				'Content-Type': 'application/json',
				'classroom-id': Hack.info.classroomID,
				'xtbz': 'ykt',
				'X-CSRFToken': token,
				'X-Requested-With': 'XMLHttpRequest'
			},
			JSON.stringify({
				heart_data: heartbeats
			})
		);
	},
	async ClearVideo(video) {
		const videoLength = video.length;
		const now = +new Date(), startTimestamp = now - videoLength * 1000;
		const heartbeats = [
			Hack.MakeHeartbeat('loadstart', video, 0, startTimestamp),
			Hack.MakeHeartbeat('seeking', video, 0, startTimestamp),
			...[
				...Array(Math.floor(videoLength / 5))
					.fill(0)
					.map((_, i) => 5 * i),
				videoLength
			].map(t => Hack.MakeHeartbeat(
				'playing', video, t, startTimestamp + t * 1000
			)),
			Hack.MakeHeartbeat('pause', video, videoLength, now),
			Hack.MakeHeartbeat('videoend', video, videoLength, now),
		];
		heartbeats.forEach((hb, i) => hb.sq = i + 1);
		return await Hack.SendHeartbeat(heartbeats);
	},
	async ClearVideosInSlide(slide) {
		for(const video of slide.videos)
			await Hack.ClearVideo(video);
	}
});

(async () => {
	await Hack.Run();
	Hack.panel.Layout([
		new Button('自动', async function() {
			Hack.autoRun = true;
			while(Hack.autoRun) {
				const nextPageLabel = $('.flag.noRead');
				if(!nextPageLabel)
					break;
				nextPageLabel.click();
				await Delay(100);
				const currentSlide = $('.swiper-slide-active .page')?.innerText;
				const slide = Hack.slides.find(slide => slide.index == currentSlide);
				if(!slide)
					throw new Error('找不到页面');
				await Hack.ClearAudios();
				await Hack.ClearVideosInSlide(slide);
				await Delay(100);
			}
			Hack.autoRun = false;
		}),
		new Button('停止自动', function() {
			Hack.autoRun = false;
		}),
		new Button('清除页面内语音', Hack.ClearAudios),
		new Button('一键看完所有视频', async function() {
			for(const video of Hack.videos)
				await Hack.ClearVideo(video);
		}),
	]);
})();
