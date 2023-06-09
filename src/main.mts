import { window, Hack as HackBase, type State, Cookie, Utils, Ajax, Media } from '@cuclh/userscript-base';
import * as Ne from '@nianyi-wang/element';
import * as _ from 'lodash';
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
};

type SlidePage = {
	PageIndex: number;
	SlideID: number;
	Shapes: SlideShape[];
	Problem?: {
		ProblemID: number;
		Type: string;
		Score: number;
		Bullets?: any[];
	};
};

function ToDateString(date: Date): string {
	return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

class Hack extends HackBase {
	static instance: Hack = null;

	static urlSchemas = {
		generic: {
			classroom: /\/v2\/web\/studentLog\/(\d+)$/,
			courseware: /\/v2\/web\/studentCards\/(\d+)\/(\d+)\/(\d+)$/,
		},
	};

	info = {
		classroomId: '',
		coursewareId: '',
		activityId: '',
	};

	activities: Activity[];
	activity: Activity;
	courseware: Courseware;

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
		this.activities = [];
		for(let page = 0; ; ++page) {
			try {
				const activities = await this.FetchActivitiesByPage(page);
				if(activities.length == 0)
					break;
				this.activities.push(...activities);
			}
			catch(e) {
				this.panel.Log(`获取活动列表失败：${e}`, 'warning');
				break;
			}
		}
		this.activities.sort((a, b) => a.create_time - b.create_time);
	}

	async FetchCoursewareDetails(): Promise<void> {
		this.courseware = null;
		try {
			const ajax = new Ajax(`/v2/api/web/cards/detlist/${this.activity.courseware_id}`, 'GET');
			ajax.SetParams({
				'classroom_id': this.info.classroomId,
			});
			const json = JSON.parse(await ajax.Post());
			if(json.errcode !== 0)
				throw new Error(json.errmsg);
			this.courseware = json.data;
		}
		catch(e) {
			this.panel.Log(`获取课程信息失败：${e}`, 'warning');
		}
	}

	async AnalyzeBasicInformation(): Promise<void> {
		this.panel.Log('正在分析基本信息');
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
		this.panel.Log(`共获取了 ${this.activities.length} 个活动`);

		if(this.info.coursewareId) {
			this.activity = this.activities.find(activity => activity.courseware_id == this.info.coursewareId) || null;
			if(this.activity == null) {
				this.panel.Log('无法获取 courseware id', 'warning');
			}
			else {
				this.panel.Log('尝试获取课程信息');
				await this.FetchCoursewareDetails();
				if(this.courseware !== null) {
					this.panel.Log(`获取课程信息成功，共有 ${this.courseware.Slides.length} 张幻灯片`);
					console.log(this.courseware);
				}
			}
		}
	}

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

					const unreadAnnouncements = this.activities.filter(activity =>
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

					const unfinishedCourses = this.activities.filter(activity =>
						activity.type === 2 &&
						(activity.view == null || !activity.view.done)
					);
					this.panel.Header('未完成课件');
					this.panel.Add(Ne.Create('ul', {
						classes: ['undone'],
						children: unfinishedCourses.map(course => Ne.Create('li', {
							children: [
								Ne.Create('span', {
									classes: ['date'],
									text: ToDateString(new Date(course.create_time)),
								}),
								Ne.Create('span', {
									classes: ['title'],
									text: course.title,
								}),
								Ne.Create('button', {
									text: '去完成',
									on: {
										click: () => {
											const href = `/v2/web/studentCards/${this.info.classroomId}/${course.courseware_id}/${course.id}`;
											this.activity = course;
											window.location.href = href;
										},
									},
								})
							],
						}))
					}));
				},
			},
			课件: {
				validate: () => {
					const url = new URL(window.location.href);
					return Hack.urlSchemas.generic.courseware.test(url.pathname);
				},
				load: async () => {
					this.panel.title += '（课件页）';

					this.panel.Header('课件');
					this.panel.Button('打开课件', () => Utils.$('.check').click());
					this.panel.Button('关闭课件', () => Utils.$('.prepareDialog .el-dialog__footer .el-button:nth-child(1)').click());

					this.panel.Header('幻灯片');
				},
			},
		});

		this.life.on('urlchange', async () => {
			this.panel.Clear();
			this.panel.title = '雨课堂 Hack';
			await this.AnalyzeBasicInformation();
			this.TriggerAutoTransit();
		});
	}
}

new Hack();