import * as HackBase from '@cuclh/userscript-base';

class Hack extends HackBase.Hack {
	constructor() {
		super();
		this.TryInit().then(() => {
			this.panel.Log('Hack initialized');
		});
	}

	async Init() {
		return true;
	}
}

window.hack = new Hack();
