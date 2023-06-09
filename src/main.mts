import { window, Hack as HackBase, type State, Cookie, Utils, Ajax, Media } from '@cuclh/userscript-base';
import * as Ne from '@nianyi-wang/element';
import * as _ from 'lodash';
import { GetMediaDurationByURL } from './util.mjs';
import './main.styl';

type Activity = {
	title: string;
	id: number;
	/*
		2 - 课件
		9 - 公告
		14 - 课堂
	*/
	type: number;
	create_time: number;
	end?: number | null;	// 结束时间
	courseware_id: string;
	is_finished?: boolean;	// 课堂是否已结束
	attended_status?: boolean;	// 课堂是否成功签到
	hasRead?: boolean;	// 公告是否已读
	has_mooc?: boolean;	// 是否有课件
	attachments?: any[];
	count?: number;		// 需要看的总数
	view?: {			// 已看数
		depth: number;
		done: boolean;
	};
};

type Courseware = {
	Slides: SlidePage[];
};

type SlideShape = {
	viewed?: boolean;
	playurl?: string;
	URL?: string;
};

type SlideFeature = 'video' | 'problem';
type SlidePage = {
	PageIndex: number;
	MasterIndex: number;
	SlideID: number;
	Shapes: SlideShape[];
	Problem?: {
		ProblemID: number;
		Type: string;
		Score: number;
		Bullets?: any[];
	};
};
function GetSlideFeatures(slide: SlidePage): SlideFeature[] {
	const features: SlideFeature[] = [];
	if('Problem' in slide)
		features.push('problem');
	if(slide.Shapes.some(shape => 'playurl' in shape))
		features.push('video');
	return features;
};

function ToDateString(date: Date): string {
	return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

class Hack extends HackBase {
	// #region 静态字段
	static instance: Hack = null;
	static urlSchemas = {
		generic: {
			classroom: /\/v2\/web\/studentLog\/(\d+)$/,
			courseware: /\/v2\/web\/studentCards\/(\d+)\/(\d+)\/(\d+)$/,
		},
	};
	// #endregion

	// #region 内部字段
	info: {
		classroomId: string;
		coursewareId: string;
		activityId: string;
		userId: number;

		activities: Activity[];
		activity: Activity;
		courseware: Courseware;
	} = {
			classroomId: null,
			coursewareId: null,
			activityId: null,
			userId: null,

			activities: [],
			activity: null,
			courseware: null,
		};

	status = {
		get SlidesShown(): boolean {
			return Utils.$('.studentCoursewarePPT__component') !== null;
		}
	};
	// #endregion

	// #region 信息获取
	async FetchUserId(): Promise<void> {
		try {
			const ajax = new Ajax('/api/web_lesson/user_info/', 'GET');
			this.info.userId = JSON.parse(await ajax.Post()).data.user_id;
		}
		catch(e) {
			this.panel.Log(`获取 user ID 失败：${e}`, 'warning');
		}
	}

	async FetchActivitiesByPage(page: number): Promise<Activity[]> {
		page = Math.floor(page);
		const ajax = new Ajax(`/v2/api/web/logs/learn/${this.info.classroomId}`, 'GET');
		ajax.SetParams({
			actype: '-1',
			page: page.toString(),
			offset: '0',
			sort: '1',
		});
		const response = await ajax.Post();
		if(ajax.status != 200)
			throw new Error(response);
		const json = JSON.parse(response);
		if(json.errcode !== 0)
			throw new Error(json.errmsg);
		return json.data.activities;
	}

	async FetchActivities(): Promise<void> {
		this.info.activities = [];
		for(let page = 0; ; ++page) {
			try {
				const activities = await this.FetchActivitiesByPage(page);
				if(activities.length == 0)
					break;
				this.info.activities.push(...activities);
			}
			catch(e) {
				this.panel.Log(`获取活动列表失败：${e}`, 'warning');
				break;
			}
		}
		this.info.activities.sort((a, b) => a.create_time - b.create_time);
	}

	async FetchCoursewareDetails(coursewareId: string): Promise<Courseware> {
		try {
			const ajax = new Ajax(`/v2/api/web/cards/detlist/${coursewareId}`, 'GET');
			ajax.SetParams({
				'classroom_id': this.info.classroomId,
			});
			const json = JSON.parse(await ajax.Post());
			if(json.errcode !== 0)
				throw new Error(json.errmsg);
			return json.data;
		}
		catch(e) {
			this.panel.Log(`获取课程信息失败：${e}`, 'warning');
			return null;
		}
	}

	async AnalyzeBasicInformation(): Promise<void> {
		this.panel.Log('分析基本信息');

		this.panel.Log('尝试获取 user ID');
		await this.FetchUserId();

		const url = new URL(window.location.href);
		switch(true) {
			// 公用服务器 - 教室页
			case Hack.urlSchemas.generic.classroom.test(url.pathname): {
				[, this.info.classroomId] = Hack.urlSchemas.generic.classroom.exec(url.pathname);
				break;
			}
			// 公用服务器 - 课件页
			case Hack.urlSchemas.generic.courseware.test(url.pathname): {
				[, this.info.classroomId, this.info.coursewareId, this.info.activityId] = Hack.urlSchemas.generic.courseware.exec(url.pathname);
				break;
			}
		}

		if(!this.info.classroomId) {
			this.panel.Log('无法获取 classroom ID', 'warning');
			return;
		}
		this.panel.Log('尝试获取活动列表');
		await this.FetchActivities();
		this.panel.Log(`共获取了 ${this.info.activities.length} 个活动`);

		if(this.info.coursewareId) {
			this.info.activity = this.info.activities.find(activity => activity.courseware_id == this.info.coursewareId) || null;
			if(this.info.activity === null) {
				this.panel.Log('无法获取 courseware id', 'warning');
			}
			else {
				this.panel.Log('尝试获取课程信息');
				this.info.courseware = await this.FetchCoursewareDetails(this.info.activity.courseware_id);
				if(this.info.courseware !== null) {
					this.panel.Log(`获取课程信息成功，共有 ${this.info.courseware.Slides.length} 张幻灯片`);
					console.log(this.info.courseware);
				}
			}
		}
	}
	// #endregion

	// #region 幻灯片操作
	OpenSlides() {
		Utils.$('.check')?.click();
	}

	CloseSlides() {
		Utils.$('.prepareDialog .el-dialog__footer .el-button:nth-child(1)').click();
	}

	/** @param index Start from zero. */
	async SwitchToSlide(index: number | SlidePage) {
		if(typeof index !== 'number')
			index = index.MasterIndex - 1;
		if(!this.status.SlidesShown)
			this.OpenSlides();
		await Utils.Delay(0);
		Utils.$(`.swiper-slide:nth-child(${index + 1})`)?.click();
	}

	MakeHeartbeat(eventType: string, {
		duration, url, slideIndex,
		watchTime, timestamp
	}) {
		return {
			c: this.info.classroomId,
			cards_id: this.info.coursewareId,
			cc: '',
			classroomid: this.info.classroomId,
			cp: +watchTime,
			d: duration,
			et: eventType,
			fp: 0,
			i: 5,
			lob: 'ykt',
			n: 'ali-cdn.xuetangx.com',
			p: 'web',
			pg: `${this.info.classroomId}_qrwx`,
			skuid: '',
			slide: slideIndex,
			sp: 1,
			sq: -1,
			t: 'ykt_cards',
			tp: 0,
			ts: Math.floor(timestamp),
			u: this.info.userId,
			uip: '',
			v: this.info.classroomId,
			v_url: url
		};
	}
	async SendHeartbeatsDirect(heartbeats) {
		const token = Cookie.get('csrftoken');
		const ajax = new Ajax('/video-log/heartbeat/', 'POST');
		const headers = {
			'Accept': '*/*',
			'Content-Type': 'application/json',
			'classroom-id': this.info.classroomId,
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
	async SendHeartbeats(heartbeats: any[], limit: number = 10) {
		while(heartbeats.length) {
			const queue = heartbeats.splice(0, limit);
			queue.forEach((heartbeat, i) => heartbeat['sq'] = i + 1);
			await this.SendHeartbeatsDirect(queue);
		}
	}
	async MakeHeartbeats(playUrl: string, vUrl: string, slideIndex: number) {
		const duration = await GetMediaDurationByURL(playUrl);
		const now = +new Date(), startTimestamp = now - duration * 1000;
		return [
			this.MakeHeartbeat('loadstart', {
				duration, url: vUrl, slideIndex,
				watchTime: 0, timestamp: startTimestamp
			}),
			this.MakeHeartbeat('seeking', {
				duration, url: vUrl, slideIndex,
				watchTime: 0, timestamp: startTimestamp
			}),
			...[
				...Array(Math.floor(duration / 5))
					.fill(0)
					.map((_, i) => 5 * i),
				duration
			].map(t => this.MakeHeartbeat('playing', {
				duration, url: vUrl, slideIndex,
				watchTime: t, timestamp: startTimestamp + t * 1000
			})),
			this.MakeHeartbeat('pause', {
				duration, url: vUrl, slideIndex,
				watchTime: duration, timestamp: now
			}),
			this.MakeHeartbeat('videoend', {
				duration, url: vUrl, slideIndex,
				watchTime: duration, timestamp: now
			}),
		];
	}

	async FinishVideoOnSlide(slide: SlidePage) {
		for(const shape of slide.Shapes) {
			if('playurl' in shape && !shape.viewed) {
				const heartbeats = await this.MakeHeartbeats(shape.playurl, shape.URL, slide.PageIndex);
				await this.SendHeartbeats(heartbeats);
			}
		}
	}
	// #endregion

	constructor() {
		super();
		Hack.instance = this;

		this.AddStates({
			主页: {
				validate: () => {
					const url = new URL(window.location.href);
					return /\/v2\/web\/index$/.test(url.pathname);
				},
				load: () => {
					this.panel.title += '（主页）';
					this.panel.Text('点击教室卡片以启动 hack');
				},
			},
			教室: {
				validate: () => {
					const url = new URL(window.location.href);
					return Hack.urlSchemas.generic.classroom.test(url.pathname);
				},
				load: async () => {
					this.panel.title += '（教室页）';
					await this.AnalyzeBasicInformation();

					const unreadAnnouncements = this.info.activities.filter(activity =>
						activity.type === 9 &&
						!activity.hasRead
					);
					this.panel.Header('未读公告');
					this.panel.Add(Ne.Create('ul', {
						classes: ['undone'],
						children: unreadAnnouncements.map(annoucement => Ne.Create('li', {
							children: [
								Ne.Create('span', {
									classes: ['date'],
									text: ToDateString(new Date(annoucement.create_time)),
								}),
								Ne.Create('span', {
									classes: ['title'],
									text: annoucement.title,
								}),
								Ne.Create('button', {
									text: '去阅读',
									on: {
										click: () => {
											const href = `/v2/web/noticeView/${this.info.classroomId}/${annoucement.courseware_id}?identity=0&type=9`;
											window.location.href = href;
										},
									},
								})
							],
						}))
					}));

					const unfinishedCoursewares = this.info.activities.filter(activity =>
						activity.type === 2 &&
						(activity.view == null || !activity.view.done)
					);
					this.panel.Header('未完成课件');
					const $unfinishedCoursewares = unfinishedCoursewares.map(courseware => Ne.Create('li', {
						rawAttributes: { course: courseware },
						children: [
							Ne.Create('span', {
								classes: ['date'],
								text: ToDateString(new Date(courseware.create_time)),
							}),
							Ne.Create('span', {
								classes: ['title'],
								text: courseware.title,
							}),
							Ne.Create('button', {
								text: '去完成',
								on: {
									click: () => {
										const href = `/v2/web/studentCards/${this.info.classroomId}/${courseware.courseware_id}/${courseware.id}`;
										this.info.activity = courseware;
										window.location.href = href;
									},
								},
							})
						],
					}));
					this.panel.Add(Ne.Create('ul', {
						classes: ['undone'],
						children: $unfinishedCoursewares,
					}));
					for(const $unfinishedCourse of $unfinishedCoursewares) {
						const activity = ($unfinishedCourse as any).course as Activity;
						this.FetchCoursewareDetails(activity.courseware_id).then(courseware => {
							if(courseware.Slides.every(slide => !slide.Shapes.some(shape => 'playurl' in shape && !shape.viewed))) {
								Ne.Create('span', {
									parent: $unfinishedCourse,
									text: '视频已完成',
								});
							}
						});
					}
				},
			},
			课件: {
				validate: () => {
					const url = new URL(window.location.href);
					return Hack.urlSchemas.generic.courseware.test(url.pathname);
				},
				load: async () => {
					this.panel.title += '（课件页）';
					await this.AnalyzeBasicInformation();

					this.panel.Header('课件');
					this.panel.Button('打开课件', this.OpenSlides);
					this.panel.Button('关闭课件', this.CloseSlides);

					this.panel.Header('幻灯片');
					this.panel.Add(Ne.Create('ol', {
						children: this.info.courseware.Slides.map(slide => Ne.Create('li', {
							children: [
								Ne.Create('span', {
									classes: ['features'],
									text: GetSlideFeatures(slide).join(' '),
								}),
								Ne.Create('button', {
									text: '跳转',
									on: {
										click: () => this.SwitchToSlide(slide),
									},
								}),
								!GetSlideFeatures(slide).includes('video') ? null : Ne.Create('button', {
									text: '看完',
									on: {
										click: async () => {
											await this.SwitchToSlide(slide);
											await this.FinishVideoOnSlide(slide);
										},
									}
								})
							].filter(e => e !== null),
						})),
					}));
				},
			},
		});

		this.life.on('start', () => {
			window['hack'] = this;
		});

		this.life.on('urlchange', async () => {
			this.panel.Clear();
			this.panel.title = '雨课堂 Hack';
			this.TriggerAutoTransit();
		});
	}
}

new Hack();