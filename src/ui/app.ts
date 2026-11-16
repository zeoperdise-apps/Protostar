import { t, setLocale, getLocale, browserLocale, translateRendered, type Locale } from '../i18n';
import { DOMMessages } from '../i18n/dom';
import { BattleEngine } from '../game/engine';
import { catalog, presets, diagnosticMessage } from '../i18n/display';
import { validateProgram } from '../game/program';
import { cloneRobot, createStarterRobots } from '../data/presets';
import { SaveStore, exportRobot, importRobot, importSave, MAX_ROBOTS, errorMessage } from '../storage/save';
import type { BattleSnapshot, RobotDesign, SaveData, Settings, Program } from '../game/types';
import { ArenaView } from '../render/arena';
import { sensorOverlay } from '../render/sensors';
import { SoundBank } from '../audio/sound';
import { Workbench } from './editor';
import { esc, icon, robotMark } from './dom';

type Tab = 'battle' | 'editor' | 'library';
export class CombatLab {
  private store = new SaveStore(undefined, browserLocale(navigator.language));
  private messages = new DOMMessages();
  private battlePresetIds: [string|null,string|null] = [null,null];
  private modalRefresh: (()=>void)|null = null;
  private save: SaveData = this.store.load();
  private engine: BattleEngine;
  private battlePrograms!: [Program, Program];
  private snapshot: BattleSnapshot;
  private view: ArenaView;
  private sound = new SoundBank(() => this.save.settings);
  private workbench: Workbench;
  private tab: Tab = 'battle';
  private running = false;
  private started = false;
  private dirty = false;
  private resultHandled = false;
  private activePreset: string | null = null;
  private accumulator = 0;
  private previousTime = 0;
  private lastHud = 0;
  private raf = 0;
  private toastTimer = 0;
  private lastToast = '';
  constructor(private root: HTMLElement) {
    setLocale(this.save.settings.locale);
    this.engine=this.createEngine();this.snapshot=this.engine.snapshot();
    this.shell();this.messages.bind(this.root);
    this.view=new ArenaView(this.el('#arena'),this.snapshot);
    this.workbench=new Workbench(this.el('#workbench'),()=>this.robot(),()=>this.designChanged(),()=>{this.switchTab('battle');this.toast(t("AIを保存しました。「対戦開始」で新しい設計を試せます。"));},id=>this.addRobot(cloneRobot(presets().find(p=>p.id===id)!.robot), t("テンプレート")));
    this.root.addEventListener('click',event=>this.onClick(event));
    this.root.addEventListener('change',event=>this.onChange(event));
    this.root.addEventListener('input',event=>this.onInput(event));
    document.addEventListener('keydown',this.onKey);
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pagehide',event=>{if(!event.persisted)this.dispose();});
    this.el<HTMLDialogElement>('#modal').addEventListener('click',event=>{if(event.target===this.el('#modal'))this.closeModal();});
    this.refreshSelectors();this.renderPresets();this.renderLibrary();this.workbench.render();this.workbench.setTemplates(presets());
    this.updateHud();this.updateStorage();this.frame(0);
    if(this.store.status.code)this.toast(t(this.store.status.code),7000);
    this.updateLanguageButtons();
  }
  private el<T extends HTMLElement=HTMLElement>(selector: string):T {return this.root.querySelector<T>(selector)!;}
  private robot():RobotDesign{return this.save.robots.find(r=>r.id===this.save.config.leftRobotId)!;}
  private opponent():RobotDesign {return this.save.config.opponentType==='preset'?presets().find(p=>p.id===this.save.config.opponentId)!.robot:this.save.robots.find(r=>r.id===this.save.config.opponentId)!;}
  private createEngine():BattleEngine {
    const robots:[RobotDesign,RobotDesign]=[this.robot(),this.opponent()];
    this.battlePresetIds=[null,this.save.config.opponentType==='preset'?this.save.config.opponentId:null];
    this.battlePrograms=robots.map(robot=>structuredClone(robot.program)) as [Program,Program];
    return new BattleEngine({robots,seed:this.save.config.seed});
  }
  private shell():void {
    this.root.innerHTML=`<header class="app-header"><a class="brand" href="#" aria-label="${t("PROTOSTAR ホーム")}"><span class="brand-logo"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m20 2 17 10v16L20 38 3 28V12z" stroke="currentColor" stroke-width="1.4"/><path d="m11 11 19 0-5 9H16v10h-5z" fill="currentColor"/><path d="m26 25 4 6" stroke="currentColor" stroke-width="2"/></svg></span><span><b>PROTOSTAR</b><small>AUTONOMOUS COMBAT LAB</small></span></a><nav class="main-nav" aria-label="${t("メイン画面")}"><button class="active" data-tab="battle">${icon('battle')}<span>${t("バトル")}</span></button><button data-tab="editor">${icon('chip')}<span>${t("AIワークベンチ")}</span></button><button data-tab="library">${icon('robot')}<span>${t("機体庫")}</span></button></nav><div class="header-tools">${this.languageButtons()}<span id="save-status" class="save-status" title="${t("このブラウザに自動保存")}"><i></i>${t("保存済み")}</span><button class="icon-button" id="sound-button" data-action="sound" aria-label="${t("サウンド切替")}">${icon('sound')}</button><button class="icon-button guide-button" data-action="help" aria-label="${t("使い方ガイド")}">${icon('help')}<span>${t("ガイド")}</span></button></div></header><main><section id="battle-page" class="page"><div class="page-heading"><div><div class="eyebrow">SIMULATE / OBSERVE / REFINE</div><h1>${t("バトルシミュレーター")}<span class="heading-dot"></span></h1><p>${t("設計したAIが、戦う。観察し、組み替え、次の一手へ。")}</p></div><div class="system-state"><i></i> SYSTEM ONLINE <span>${t("90秒制限")}</span></div></div><div class="battle-layout"><section class="panel battle-panel"><div class="arena-heading"><span class="micro">TEST FIELD <b>01</b></span><span id="match-state" class="state-chip">READY</span><span class="match-clock"><b id="elapsed">00.0</b><span>/ 90.0 SEC</span></span></div><div class="combatants">${[0,1].map(i=>`<div class="combatant side-${i}"><div class="combatant-title"><span class="team-label">${i?'OPPONENT':'YOUR ROBOT'}</span><strong id="robot-name-${i}"></strong><span id="hp-text-${i}" class="hp-number"></span></div><div class="hp-track"><div id="hp-${i}"></div></div><div class="energy-row"><span id="robot-gear-${i}"></span><span class="energy-caption">EN <b id="energy-text-${i}"></b></span></div><div class="energy-track"><div id="energy-${i}"></div></div></div>`).join('')}<span class="versus">VS</span></div><div id="arena" class="arena"></div><div class="playback"><button class="button primary" data-action="start" id="start-button">${icon('play')}${t("対戦開始")}</button><div class="button-group playback-buttons"><button data-action="pause" id="pause-button" disabled aria-label="${t("一時停止")}">${icon('pause')}</button><button data-action="step" id="step-button" title="${t("0.1秒 / 6tick進める")}" aria-label="${t("0.1秒進める")}">${icon('step')}</button><button data-action="reset" title="${t("同じ条件でリセット")}" aria-label="${t("同条件リセット")}">${icon('reset')}</button></div><div class="speed-buttons" aria-label="${t("再生速度")}">${[1,2,4].map(speed=>`<button data-speed="${speed}" class="${this.save.settings.speed===speed?'active':''}" aria-pressed="${this.save.settings.speed===speed}">${speed}×</button>`).join('')}</div><div class="view-toggles"><label title="${t("センサー実行時に判定範囲とYES/NOを表示。敵検知は遮蔽物も判定に考慮します。")}"><input type="checkbox" id="sensors" ${this.save.settings.showSensors?'checked':''}>${t("センサー")}</label><label><input type="checkbox" id="trails" ${this.save.settings.showTrails?'checked':''}>${t("軌跡")}</label></div></div><div class="arena-caption"><span id="match-caption">${t("2機の自律AIが対戦します。操作で機体を動かす必要はありません。")}</span><button class="text-button" data-action="show-result" id="result-link" hidden>${t("対戦結果を表示")} ${icon('arrow',13)}</button><span class="micro">${t("自律対戦")}</span></div><div id="sensor-status" class="sensor-status" hidden></div></section><aside class="battle-sidebar"><section class="panel setup-panel"><div class="panel-heading"><span>${t("対戦設定")}</span><span class="micro">MATCH SETUP</span></div><div class="setup-fields"><label><span class="field-label"><i class="cyan-dot"></i>${t("自作機体")}<button class="text-button" data-action="edit" type="button">${t("AI編集")} ${icon('arrow',12)}</button></span><select id="left-robot" aria-label="${t("自作機体")}"></select></label><div class="mode-switch"><button data-opponent-type="preset">${t("プリセット")}</button><button data-opponent-type="custom">${t("自作AI同士")}</button></div><label><span class="field-label"><i class="coral-dot"></i>${t("対戦相手")}</span><select id="opponent-robot" aria-label="${t("対戦相手")}"></select></label><div class="seed-row"><label>RANDOM SEED<input id="seed" type="number" min="0" max="4294967295" step="1" value="${this.save.config.seed}" aria-label="${t("乱数シード")}"></label><button class="icon-button" data-action="seed" title="${t("新しいシード")}" aria-label="${t("シード変更")}">${icon('reset',16)}</button></div><p id="setup-note" class="setup-note">${t("同じシードと設計で、同じ戦闘を再現。")}</p></div></section><section class="panel trace-panel"><div class="panel-heading"><span>${t("AI実行トレース")}</span><span class="micro">LIVE</span></div><div class="trace-tabs"><button data-trace="0" class="active">${t("自機")}</button><button data-trace="1">${t("相手")}</button></div><div id="trace" class="trace-body"></div></section></aside></div><section class="opponents-section"><div class="section-heading"><h2>${t("プリセットに挑戦")}</h2><span>${t("6つの戦法で、AIの完成度を試す")}</span><span id="clear-count" class="clear-count"></span></div><div id="preset-cards" class="preset-cards"></div></section></section><section id="editor-page" class="page" hidden><div class="page-heading editor-heading"><div><div class="eyebrow">BUILD A BETTER DECISION</div><h1>${t("AIワークベンチ")}</h1><p>${t("チップと矢印をつなぎ、機体の判断を設計する。")}</p></div><label class="inline-select">${t("編集中の機体")}<select id="editor-robot" aria-label="${t("AI編集する機体")}"></select></label></div><div id="workbench"></div></section><section id="library-page" class="page" hidden><div class="page-heading"><div><div class="eyebrow">HARDWARE MEETS LOGIC</div><h1>${t("機体庫")}</h1><p>${t("フレームと左右の武器を選び、戦法に合う一機へ。")}</p></div><div class="library-actions"><button class="button" data-action="import">${icon('upload')}${t("入力")}</button><button class="button" data-action="export-all">${icon('download')}${t("全データ出力")}</button><button class="button primary" data-action="new">${icon('plus')}${t("新規機体")}</button></div></div><div class="library-layout"><div id="robot-cards" class="robot-cards"></div><section id="robot-detail" class="panel robot-detail"></section></div></section></main><footer class="app-footer"><span>PROTOSTAR <span class="muted">/</span> AUTONOMOUS COMBAT LAB</span><span>16 × 16 CHIP PROGRAMMING<span class="footer-divider">${t("・")}</span>LOCAL FIRST</span></footer><div id="toast" class="toast" role="status" hidden></div><dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog><input id="import-file" type="file" accept=".json,application/json" hidden>`;
  }
  private traceSlot: 0|1 = 0;
  private onClick(event: Event):void {
    const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
    if(target.dataset.locale){this.changeLocale(target.dataset.locale as Locale);return;}
    if(target.dataset.tab){this.switchTab(target.dataset.tab as Tab);return;}
    if(target.dataset.speed){this.save.settings.speed=Number(target.dataset.speed) as Settings['speed'];this.persist();this.root.querySelectorAll<HTMLElement>('[data-speed]').forEach(b=>{b.classList.toggle('active',b===target);b.setAttribute('aria-pressed',String(b===target));});return;}
    if(target.dataset.trace!==undefined){this.traceSlot=Number(target.dataset.trace) as 0|1;this.root.querySelectorAll('[data-trace]').forEach(b=>b.classList.toggle('active',b===target));this.updateTrace();return;}
    if(target.dataset.preset){this.save.config.opponentType='preset';this.save.config.opponentId=target.dataset.preset;this.configChanged();return;}
    if(target.dataset.opponentType){this.save.config.opponentType=target.dataset.opponentType as 'preset'|'custom';this.save.config.opponentId=this.save.config.opponentType==='preset'?presets()[0].id:this.save.robots.find(r=>r.id!==this.robot().id)?.id||this.robot().id;this.configChanged();return;}
    if(target.dataset.robot){this.selectRobot(target.dataset.robot);return;}
    switch(target.dataset.action){
      case 'start':this.start();break;
      case 'pause':this.togglePause();break;
      case 'step':this.step();break;
      case 'reset':this.reset();break;
      case 'edit':this.closeModal();this.switchTab('editor');break;
      case 'library':this.closeModal();this.switchTab('library');break;
      case 'seed':this.save.config.seed=crypto.getRandomValues(new Uint32Array(1))[0];this.el<HTMLInputElement>('#seed').value=String(this.save.config.seed);this.configChanged();break;
      case 'sound':this.sound.unlock();this.save.settings.sound=!this.save.settings.sound;this.persist();this.updateSoundButton();break;
      case 'help':this.help();break;
      case 'close':this.closeModal();break;
      case 'retry':this.closeModal();this.reset();this.running=true;this.started=true;this.sound.unlock();this.updateHud();break;
      case 'show-result':this.showResult();break;
      case 'new':this.addRobot(cloneRobot(createStarterRobots(getLocale())[0]),t("新規"));break;
      case 'duplicate':this.addRobot(cloneRobot(this.robot()),t("コピー"));break;
      case 'delete-robot':this.confirmDelete();break;
      case 'delete-confirm':this.deleteRobot();break;
      case 'export-robot':this.download(exportRobot(this.robot()),this.robot().name);break;
      case 'export-all':this.download(this.store.export(),'protostar-save');break;
      case 'import':this.el<HTMLInputElement>('#import-file').click();break;
      case 'import-confirm':this.applyImport();break;
      case 'help-chips':this.help(true);break;
    }
  }
  private onChange(event:Event):void {
    const target=event.target as HTMLInputElement;
    if(['left-robot','editor-robot'].includes(target.id))this.selectRobot(target.value);
    if(target.id==='opponent-robot'){this.save.config.opponentId=target.value;this.configChanged();}
    if(target.id==='seed'){
      const value=Number(target.value);if(!Number.isInteger(value)||value<0||value>0xffffffff){target.value=String(this.save.config.seed);this.toast(t("シードは0〜4294967295の整数を入力してください。"));return;}
      this.save.config.seed=value;this.configChanged();
    }
    if(target.id==='sensors'||target.id==='trails'){this.save.settings[target.id==='sensors'?'showSensors':'showTrails']=target.checked;this.persist();}
    if(target.id==='frame'||target.id==='leftWeapon'||target.id==='rightWeapon'){
      const robot=this.robot();if(target.id==='frame')robot.frame=target.value as RobotDesign['frame'];else robot[target.id]=target.value as RobotDesign['leftWeapon'];
      this.designChanged();this.renderLibrary();
    }
    if(target.id==='robot-name'){
      const name=target.value.trim();if(!name||name.length>40){target.value=this.robot().name;this.toast(t("機体名は1〜40文字で入力してください。"));return;}
      this.robot().name=name;this.designChanged();this.refreshSelectors();this.renderLibrary();
    }
    if(target.id==='import-file'&&target.files?.[0]){void this.readImport(target.files[0]);target.value='';}
  }
  private onInput(event:Event):void {
    const target=event.target as HTMLInputElement;if(target.id==='volume'){this.save.settings.volume=Number(target.value);this.persist();}
  }
  private onKey=(event:KeyboardEvent):void=>{
    if(event.code!=='Space'||event.repeat||this.tab!=='battle'||this.el<HTMLDialogElement>('#modal').open)return;
    if((event.target as HTMLElement).closest('input,textarea,select,button,[contenteditable="true"]'))return;
    event.preventDefault();if(!this.started)this.start();else this.togglePause();
  };
  private onVisibility=():void=>{this.accumulator=0;this.previousTime=0;if(document.hidden&&this.running){this.running=false;this.updateHud();}};
  private switchTab(tab:Tab):void {
    if(this.tab!==tab&&this.running){this.running=false;this.accumulator=0;}
    this.tab=tab;(['battle','editor','library'] as Tab[]).forEach(id=>{this.el(`#${id}-page`).hidden=id!==tab;});
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach(button=>{button.classList.toggle('active',button.dataset.tab===tab);button.setAttribute('aria-current',button.dataset.tab===tab?'page':'false');});
    if(tab==='editor'){this.workbench.render();this.workbench.setTemplates(presets());this.workbench.updateExecution(this.snapshot);}
    if(tab==='library')this.renderLibrary();this.updateHud();this.previousTime=0;
  }
  private selectRobot(id:string):void {this.save.config.leftRobotId=id;this.configChanged();this.renderLibrary();this.workbench.render();this.workbench.setTemplates(presets());}
  private persist():void {try{this.store.save(this.save);this.updateStorage();}catch(error){this.toast(errorMessage(error,getLocale()));}}
  private updateStorage():void {const status=this.el('#save-status');status.innerHTML=`<i></i>${this.store.status.persistent?t("保存済み"):t("メモリ保存")}`;status.title=this.store.status.code?t(this.store.status.code):t("このブラウザに自動保存しています");this.updateSoundButton();}
  private updateSoundButton():void {const button=this.el<HTMLButtonElement>('#sound-button');button.innerHTML=icon(this.save.settings.sound?'sound':'mute');button.setAttribute('aria-pressed',String(this.save.settings.sound));button.setAttribute('aria-label',this.save.settings.sound?t("サウンドをオフ"):t("サウンドをオン"));}
  private configChanged():void {
    this.persist();this.refreshSelectors();this.renderPresets();
    if(!this.started){this.engine=this.createEngine();this.snapshot=this.engine.snapshot();this.view?.reset();this.dirty=false;this.updateHud();}else this.dirty=true;
    this.updateSetupNote();
  }
  private designChanged():void {this.persist();if(this.started)this.dirty=true;else{this.engine=this.createEngine();this.snapshot=this.engine.snapshot();this.view.reset();this.updateHud();}this.updateSetupNote();}
  private updateSetupNote():void {this.el('#setup-note').textContent=this.dirty?t("設計・設定の変更は次の「対戦開始」に適用されます。"):t("同じシードと設計で、同じ戦闘を再現。");this.el('#setup-note').classList.toggle('pending',this.dirty);}
  private refreshSelectors():void {
    const customOptions=this.save.robots.map(robot=>`<option value="${esc(robot.id)}">${esc(robot.name)}</option>`).join('');
    for(const id of ['left-robot','editor-robot']){const select=this.el<HTMLSelectElement>('#'+id);select.innerHTML=customOptions;select.value=this.save.config.leftRobotId;}
    const opponent=this.el<HTMLSelectElement>('#opponent-robot');opponent.innerHTML=this.save.config.opponentType==='preset'?presets().map(p=>`<option value="${p.id}">${String(p.level).padStart(2,'0')} / ${esc(p.name)}</option>`).join(''):customOptions;opponent.value=this.save.config.opponentId;
    this.root.querySelectorAll<HTMLElement>('[data-opponent-type]').forEach(button=>{const selected=button.dataset.opponentType===this.save.config.opponentType;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  }
  private start():void {
    const invalid=[this.robot(),this.opponent()].map(robot=>({robot,errors:validateProgram(robot.program).filter(d=>d.severity==='error')})).filter(r=>r.errors.length);
    if(invalid.length){this.modalRefresh=()=>this.start();this.running=false;this.modal(`<div class="modal-kicker coral">PROGRAM ERROR</div><h2 id="modal-title">${t("AIを修正してください")}</h2>${invalid.map(({robot,errors})=>`<p><b>${esc(robot.name)}</b></p><ul>${errors.map(d=>`<li>${esc(diagnosticMessage(d))}</li>`).join('')}</ul>`).join('')}<div class="modal-actions"><button class="button" data-action="close">${t("閉じる")}</button><button class="button primary" data-action="edit">${t("ワークベンチで修正")}</button></div>`);return;}
    this.sound.unlock();this.engine=this.createEngine();this.snapshot=this.engine.snapshot();this.activePreset=this.save.config.opponentType==='preset'?this.save.config.opponentId:null;this.started=true;this.running=true;this.dirty=false;this.resultHandled=false;this.accumulator=0;this.previousTime=0;this.sound.reset();this.view.reset();this.closeModal();this.updateSetupNote();this.updateHud();
  }
  private togglePause():void {if(!this.started||this.snapshot.result)return;this.sound.unlock();this.running=!this.running;this.accumulator=0;this.previousTime=0;this.updateHud();}
  private step():void {if(this.snapshot.result)return;if(!this.started){this.start();if(!this.started)return;}this.running=false;this.accumulator=0;this.snapshot=this.engine.step(6);this.sound.consume(this.snapshot.events);this.finish();this.updateHud();}
  private reset():void {this.running=false;this.snapshot=this.engine.reset();this.started=false;this.resultHandled=false;this.accumulator=0;this.previousTime=0;this.sound.reset();this.view.reset();this.closeModal();this.updateHud();}
  private frame=(time:number):void=>{
    const delta=this.previousTime?Math.min((time-this.previousTime)/1000,.1):0;this.previousTime=time;
    if(this.running&&!document.hidden&&this.tab==='battle'){
      this.accumulator=Math.min(this.accumulator+delta*this.save.settings.speed,16/60);
      const ticks=Math.min(16,Math.floor(this.accumulator*60));
      if(ticks>0){this.accumulator-=ticks/60;this.snapshot=this.engine.step(ticks);this.sound.consume(this.snapshot.events);this.finish();}
    }
    if(this.tab==='battle')this.view.draw(this.snapshot,this.save.settings,this.battlePrograms);
    if(time-this.lastHud>80){this.updateHud();this.lastHud=time;}
    this.raf=requestAnimationFrame(this.frame);
  };
  private finish():void {
    if(!this.snapshot.result||this.resultHandled)return;this.running=false;this.resultHandled=true;
    if(this.snapshot.result.winner===0&&this.activePreset){this.persist();this.save=this.store.recordVictory(this.activePreset);this.renderPresets();}
    this.showResult();
  }
  private updateHud():void {
    const s=this.snapshot;this.el('#elapsed').textContent=s.elapsed.toFixed(1).padStart(4,'0');
    const state=s.result?'FINISHED':this.running?'RUNNING':this.started?'PAUSED':'READY';this.el('#match-state').textContent=state;this.el('#match-state').className='state-chip '+state.toLowerCase();
    this.el('#start-button').innerHTML=`${icon('play')}${this.started||s.result?t("新しい対戦"):t("対戦開始")}`;
    const pause=this.el<HTMLButtonElement>('#pause-button');pause.disabled=!this.started||!!s.result;pause.innerHTML=icon(this.running?'pause':'play');pause.setAttribute('aria-label',this.running?t("一時停止"):t("再開"));pause.title=this.running?t("一時停止 (Space)"):t("再開 (Space)");
    this.el<HTMLButtonElement>('#step-button').disabled=!!s.result;
    this.el('#result-link').hidden=!s.result;
    this.el('#match-caption').textContent=s.result?t("戦闘終了。結果を確認し、AIを改良できます。"):this.running?t("自律戦闘中。Spaceで一時停止 / 実行トレースで判断を観察。"):this.started?t("一時停止中。「0.1秒進める」で命令を観察できます。"):t("2機の自律AIが対戦します。操作で機体を動かす必要はありません。");
    for(const robot of s.robots){const i=robot.slot;this.el(`#robot-name-${i}`).textContent=this.battleName(robot.slot);this.el(`#hp-text-${i}`).textContent=`${Math.ceil(robot.hp)} / ${robot.maxHp}`;this.el(`#hp-${i}`).style.width=`${robot.hp/robot.maxHp*100}%`;this.el(`#energy-${i}`).style.width=`${robot.energy/robot.maxEnergy*100}%`;this.el(`#energy-text-${i}`).textContent=String(Math.floor(robot.energy));this.el(`#robot-gear-${i}`).textContent=`${catalog().FRAMES[robot.frame].name} · ${catalog().WEAPONS[robot.leftWeapon].name} / ${catalog().WEAPONS[robot.rightWeapon].name}`;}
    const sensorStatus=this.el('#sensor-status');sensorStatus.hidden=!this.save.settings.showSensors;
    if(this.save.settings.showSensors){
      sensorStatus.textContent=s.robots.map(robot=>{const sensor=sensorOverlay(robot,this.battlePrograms[robot.slot]);return `${robot.slot?t("相手"):t("自機")}: ${sensor?`${sensor.label} → ${sensor.result}`:t("センサー実行時に判定範囲を表示")}`;}).join(' / ')+t("。敵検知は遮蔽物を考慮（範囲図は遮蔽で切り抜きません）。障害物は中心線と接触判定境界を表示。");
    }
    this.updateTrace();if(this.tab==='editor')this.workbench?.updateExecution(s);
  }
  private updateTrace():void {
    const robot=this.snapshot.robots[this.traceSlot],cell=robot.currentCell,history=robot.history.slice(-5).reverse();
    const coordinate=(index:number)=>`${(index%16).toString(16).toUpperCase()}:${Math.floor(index/16).toString(16).toUpperCase()}`;
    const current=cell===null?'—':coordinate(cell),latest=history[0];
    this.el('#trace').innerHTML=`<div class="trace-current"><div><small>CURRENT CELL</small><strong>${current}</strong></div><div><small>${esc(robot.lastBranch||'STANDBY')}</small><b>${latest?esc(catalog().CHIP_CATALOG[latest.kind].name):t("開始待機")}</b></div><i class="trace-led ${this.running?'live':''}"></i></div><div class="trace-history">${history.length?history.map(entry=>`<div class="trace-row"><span>${coordinate(entry.cell)}</span><b>${esc(catalog().CHIP_CATALOG[entry.kind].short)}</b><small class="${entry.success?'':'coral'}">${entry.success?entry.branch==='yes'?'YES':entry.branch==='no'?'NO':entry.branch==='jump'?'JUMP':'→':t("不発")}</small></div>`).join(''):`<p class="trace-empty">${t("対戦を開始すると、実行した命令と分岐を表示します。")}</p>`}</div>${robot.halted?`<p class="coral trace-warning">${t("AIが停止しました。プログラム診断を確認してください。")}</p>`:''}`;
  }
  private renderPresets():void {
    this.el('#clear-count').textContent=`${this.save.clearedPresets.length} / 6 CLEARED`;
    this.el('#preset-cards').innerHTML=presets().map(p=>`<button class="preset-card ${this.save.config.opponentType==='preset'&&this.save.config.opponentId===p.id?'selected':''}" data-preset="${p.id}" aria-pressed="${this.save.config.opponentType==='preset'&&this.save.config.opponentId===p.id}"><div class="preset-card-top"><span class="preset-level">${String(p.level).padStart(2,'0')}</span>${robotMark(p.robot.frame,'#ff9987')}<span class="preset-badge ${this.save.clearedPresets.includes(p.id)?'cleared':''}">${this.save.clearedPresets.includes(p.id)?icon('check',12)+' CLEAR':'PRESET'}</span></div><strong>${esc(p.name)}</strong><p>${esc(p.description)}</p><div class="preset-loadout">${catalog().WEAPONS[p.robot.leftWeapon].name} / ${catalog().WEAPONS[p.robot.rightWeapon].name}</div></button>`).join('');
  }
  private showResult():void {
    const result=this.snapshot.result;if(!result)return;this.modalRefresh=()=>this.showResult();
    const winner=result.winner,headline=winner===null?'DRAW':winner===0?'VICTORY':'DEFEAT',subtitle=winner===null?t("引き分け"):t("勝利者",{name:this.battleName(winner)});
    const reason={destroyed:t("機体撃破"),timeout:t("90秒経過 / 残HP率 → 与ダメージで判定"),'double-ko':t("同時撃破")}[result.reason];
    this.modal(`<div class="modal-kicker">BATTLE COMPLETE / ${result.duration.toFixed(1)} SEC</div><h2 id="modal-title" class="result-title ${winner===0?'cyan':winner===1?'coral':''}">${headline}</h2><p class="result-subtitle">${esc(subtitle)}</p><div class="result-reason">${reason}<span>SEED ${result.seed}</span></div><div class="result-table"><div class="result-table-head"><span>COMBAT REPORT</span><b class="cyan">${t("自機")}</b><b class="coral">${t("相手")}</b></div>${[[t("残りHP"),...result.robots.map(r=>`${Math.ceil(r.hp)} / ${r.maxHp}`)],[t("与ダメージ"),...result.robots.map(r=>Math.round(r.damage))],[t("命中 / 発射"),...result.robots.map(r=>`${r.hits} / ${r.shots}`)],[t("命中率"),...result.robots.map(r=>`${(r.accuracy*100).toFixed(1)}%`)],[t("実行命令"),...result.robots.map(r=>r.instructions)],[t("移動阻害"),...result.robots.map(r=>r.blockedMoves)]].map(row=>`<div><span>${row[0]}</span><b>${row[1]}</b><b>${row[2]}</b></div>`).join('')}</div><div class="modal-actions result-actions"><button class="button" data-action="close">${t("閉じて観察")}</button><button class="button" data-action="edit">${icon('chip',16)}${t("AIを改良")}</button><button class="button primary" data-action="retry">${icon('reset',16)}${t("同条件で再戦")}</button></div>`);
  }
  private renderLibrary():void {
    const robot=this.robot();
    this.el('#robot-cards').innerHTML=this.save.robots.map((design,index)=>`<button class="robot-card ${design.id===robot.id?'selected':''}" data-robot="${esc(design.id)}" aria-pressed="${design.id===robot.id}"><div class="robot-card-top"><span class="micro">CUSTOM ${String(index+1).padStart(2,'0')}</span><span class="micro">${design.program.cells.filter(Boolean).length} CHIPS</span></div>${robotMark(design.frame,'#5ddbe6')}<h2>${esc(design.name)}</h2><p>${catalog().FRAMES[design.frame].name} / ${catalog().FRAMES[design.frame].hp} HP</p><span class="robot-weapons">L ${catalog().WEAPONS[design.leftWeapon].name}<span>R ${catalog().WEAPONS[design.rightWeapon].name}</span></span><span class="robot-card-status">${design.id===robot.id?icon('check',14)+t(" 選択中"):t("機体を選択 ")+icon('arrow',14)}</span></button>`).join('');
    const frame=catalog().FRAMES[robot.frame];
    const weaponField=(side:'leftWeapon'|'rightWeapon',label:string)=>{const weapon=catalog().WEAPONS[robot[side]];return `<label>${label}<select id="${side}">${Object.values(catalog().WEAPONS).map(w=>`<option value="${w.id}" ${w.id===weapon.id?'selected':''}>${w.name}</option>`).join('')}</select></label><p class="equipment-description">${weapon.description}</p><div class="equipment-stats"><span>${t("威力")} <b>${weapon.damage}${weapon.projectiles>1?' × '+weapon.projectiles:''}</b></span><span>${t("射程")} <b>${weapon.range}</b></span><span>${t("冷却")} <b>${weapon.cooldown}s</b></span><span>${t("消費EN")} <b>${weapon.energy}</b></span></div>`;};
    this.el('#robot-detail').innerHTML=`<div class="panel-heading"><span>${t("機体をカスタマイズ")}</span><span class="micro">AUTO SAVE</span></div><div class="detail-body"><label>${t("機体名")}<input id="robot-name" type="text" maxlength="40" value="${esc(robot.name)}" autocomplete="off"></label><div class="equipment-block"><label>${t("フレーム")}<select id="frame">${Object.values(catalog().FRAMES).map(f=>`<option value="${f.id}" ${f.id===frame.id?'selected':''}>${f.name}</option>`).join('')}</select></label><p class="equipment-description">${frame.description}</p><div class="equipment-stats"><span>${t("耐久")} <b>${frame.hp} HP</b></span><span>${t("移動")} <b>${frame.speed}/s</b></span><span>${t("旋回")} <b>${frame.turnSpeed}°/s</b></span><span>${t("EN回復")} <b>${frame.energyRegen}/s</b></span></div></div><div class="equipment-block">${weaponField('leftWeapon',t("左武器 / LEFT POD"))}</div><div class="equipment-block">${weaponField('rightWeapon',t("右武器 / RIGHT POD"))}</div><button class="button primary full" data-action="edit">${icon('chip')}${t("AIを編集する")}</button><div class="detail-actions"><button class="button" data-action="duplicate">${icon('copy',15)}${t("複製")}</button><button class="button" data-action="export-robot">${icon('download',15)}${t("機体出力")}</button><button class="button danger" data-action="delete-robot" ${this.save.robots.length===1?'disabled':''} aria-label="${t("選択機体を削除")}">${icon('trash',15)}</button></div><p class="local-note">${t("機体は")}${this.save.robots.length} / ${MAX_ROBOTS}${t("体。保存先はこのブラウザです。")}<br>${t("JSONで書き出すとバックアップや自作AIの対戦に使えます。")}</p></div>`;
  }
  private newId():string {return `custom-${crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}`;}
  private addRobot(source:RobotDesign,suffix:string):void {
    if(this.save.robots.length>=MAX_ROBOTS){this.toast(t("limit.robots",{max:MAX_ROBOTS}));return;}
    const robot=cloneRobot(source,this.newId(),`${source.name.slice(0,32)} / ${suffix}`.slice(0,40));this.save.robots.push(robot);this.save.config.leftRobotId=robot.id;this.configChanged();this.renderLibrary();this.workbench.render();this.workbench.setTemplates(presets());this.toast(t("新しい機体として追加しました。"));
  }
  private confirmDelete():void {
    if(this.save.robots.length===1)return;
    this.modalRefresh=()=>this.confirmDelete();
    this.modal(`<div class="modal-kicker coral">DELETE ROBOT</div><h2 id="modal-title">${t("この機体を削除しますか？")}</h2><p>${esc(this.robot().name)} ${t("と、そのAIプログラムを削除します。")}</p><div class="modal-actions"><button class="button" data-action="close">${t("キャンセル")}</button><button class="button danger" data-action="delete-confirm">${t("機体を削除")}</button></div>`);
  }
  private deleteRobot():void {
    const id=this.robot().id;if(this.save.robots.length===1)return;this.save.robots=this.save.robots.filter(r=>r.id!==id);this.save.config.leftRobotId=this.save.robots[0].id;if(this.save.config.opponentType==='custom'&&this.save.config.opponentId===id)this.save.config.opponentId=this.save.robots[0].id;
    this.closeModal();this.configChanged();this.renderLibrary();this.workbench.render();this.workbench.setTemplates(presets());this.toast(t("機体を削除しました。"));
  }
  private pendingImport:SaveData|null=null;
  private async readImport(file:File):Promise<void> {
    if(file.size>1_000_000){this.toast(t("JSONは1MB以内にしてください。"));return;}
    try {
      const text=await file.text();
      // Detection only chooses the validator; all content is validated before any state changes.
      const parsed:unknown=JSON.parse(text);
      if(typeof parsed==='object'&&parsed!==null&&'version' in parsed){
        const result=importSave(text,getLocale());if(!result.ok){this.toast(result.error!);return;}
        this.pendingImport=result.data!;
        this.modalRefresh=()=>this.importConfirmation();
        this.importConfirmation();
      } else {
        const result=importRobot(text,getLocale());if(!result.ok){this.toast(result.error!);return;}
        if(this.save.robots.length>=MAX_ROBOTS){this.toast(`${t("機体は")}${MAX_ROBOTS}${t("体までです。")}`);return;}
        const robot=cloneRobot(result.robot!,this.newId());this.save.robots.push(robot);this.save.config.leftRobotId=robot.id;this.configChanged();this.renderLibrary();this.workbench.render();this.workbench.setTemplates(presets());this.toast(t("機体JSONを新しい機体として入力しました。"));
      }
    } catch {this.toast(t("JSONを読み取れませんでした。現在のデータは保持されています。"));}
  }
  private importConfirmation():void {
    if(!this.pendingImport)return;
    this.modal(`<div class="modal-kicker">IMPORT SAVE DATA</div><h2 id="modal-title">${t("保存データを置き換えますか？")}</h2><p>${t("現在の機体")}${this.save.robots.length}${t("体・勝利記録・設定を、ファイルの機体")}${this.pendingImport!.robots.length}${t("体と記録に置き換えます。必要なら先に全データを書き出してください。")}</p><div class="modal-actions"><button class="button" data-action="close">${t("キャンセル")}</button><button class="button primary" data-action="import-confirm">${t("置き換えて入力")}</button></div>`);
  }
  private applyImport():void {
    if(!this.pendingImport)return;this.save=this.pendingImport;this.pendingImport=null;this.workbench.resetHistory();this.persist();this.running=false;this.started=false;this.dirty=false;this.engine=this.createEngine();this.snapshot=this.engine.snapshot();this.resultHandled=false;this.activePreset=null;this.sound.reset();this.view.reset();this.closeModal();
    this.el<HTMLInputElement>('#seed').value=String(this.save.config.seed);this.el<HTMLInputElement>('#sensors').checked=this.save.settings.showSensors;this.el<HTMLInputElement>('#trails').checked=this.save.settings.showTrails;this.root.querySelectorAll<HTMLElement>('[data-speed]').forEach(button=>{const selected=Number(button.dataset.speed)===this.save.settings.speed;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    this.changeLocale(this.save.settings.locale);this.refreshSelectors();this.renderPresets();this.renderLibrary();this.workbench.render();this.workbench.setTemplates(presets());this.updateSetupNote();this.updateHud();this.toast(t("保存データを入力しました。"));
  }
  private download(contents:string,name:string):void {
    const safe=(name.normalize('NFKC').replace(/[^a-zA-Z0-9\u3040-\u30ff\u3400-\u9fff_-]/g,'-').replace(/-+/g,'-').slice(0,64)||'protostar')+'.json';
    const url=URL.createObjectURL(new Blob([contents],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=safe;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.toast(t("JSONを書き出しました。"));
  }
  private help(showChips=false):void {
    this.modalRefresh=()=>this.help(showChips);
    this.running=false;this.accumulator=0;this.updateHud();
    this.modal(`<div class="modal-kicker">QUICK START</div><h2 id="modal-title">${t("AIを組み、戦いから学ぶ。")}</h2><div class="help-steps"><div><b>01</b><span><strong>${t("機体を選ぶ")}</strong>${t("機体庫でフレームと左右武器を選びます。初期3機はそのまま対戦できます。")}</span></div><div><b>02</b><span><strong>${t("戦法を試す")}</strong>${t("プリセット6機、または自作AI同士で対戦。停止・0.1秒ステップとトレースで判断を確認。")}</span></div><div><b>03</b><span><strong>${t("AIを改良する")}</strong>${t("16×16盤にチップを配置して矢印を接続。変更は自動保存。次の対戦で試せます。")}</span></div></div><div class="help-note">${t("勝敗: 撃破で決着。90秒では残HP率 → 与ダメージで判定。同じ設計とシードで再現できます。")}<br>${t("Space: 一時停止 / 再開（入力中は無効）。画面切替・別タブでは自動停止します。")}</div><details class="chip-guide" ${showChips?'open':''}><summary>${t("19種類のチップを見る")}</summary>${catalog().CHIPS.map(chip=>`<div><b class="cat-${chip.category}">${chip.name}</b><p>${esc(chip.description)}</p></div>`).join('')}</details><div class="sound-setting"><label>${t("サウンド音量")}<input id="volume" type="range" min="0" max="1" step=".05" value="${this.save.settings.volume}"></label><span>${t("ブラウザにローカル保存 / アカウント不要")}</span></div><div class="modal-actions"><button class="button" data-action="edit">${t("AIワークベンチへ")}</button><button class="button primary" data-action="close">${t("ラボに戻る")}</button></div>`);
  }
  private modal(content:string):void {const dialog=this.el<HTMLDialogElement>('#modal');this.el('#modal-content').innerHTML=`<div class="modal-languages">${this.languageButtons()}</div>`+content;this.updateLanguageButtons();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
  private closeModal():void {this.el<HTMLDialogElement>('#modal').close();this.el('#modal-content').innerHTML='';this.pendingImport=null;this.modalRefresh=null;}
  private toast(message:string,duration=4200):void {clearTimeout(this.toastTimer);const toast=this.el('#toast');this.lastToast=message;toast.textContent=message;toast.hidden=false;this.messages.bind(toast);this.toastTimer=window.setTimeout(()=>toast.hidden=true,duration);}
  private languageButtons():string {
    return `<div class="language-switch" role="group" aria-label="${t('locale.label')}"><button data-locale="ja" lang="ja" aria-pressed="${getLocale()==='ja'}">JA</button><button data-locale="en" lang="en" aria-pressed="${getLocale()==='en'}">EN</button></div>`;
  }
  private updateLanguageButtons():void {this.root.querySelectorAll<HTMLElement>('[data-locale]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.locale===getLocale()));button.classList.toggle('active',button.dataset.locale===getLocale());});}
  private battleName(slot:0|1):string {
    const preset=this.battlePresetIds[slot];return preset?presets().find(p=>p.id===preset)!.robot.name:this.snapshot.robots[slot].name;
  }
  private changeLocale(locale:Locale):void {
    const position={x:window.scrollX,y:window.scrollY};
    const fields=[...this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input:not([type=file]),select')].map(el=>({id:el.id,value:el.value,checked:el instanceof HTMLInputElement?el.checked:false,start:el instanceof HTMLInputElement?el.selectionStart:null,end:el instanceof HTMLInputElement?el.selectionEnd:null,focused:el===document.activeElement}));
    const dialog=this.el<HTMLDialogElement>('#modal'),modalScroll=dialog.scrollTop,details=[...dialog.querySelectorAll<HTMLDetailsElement>('details')].map(el=>el.open);
    this.save.settings.locale=locale;setLocale(locale);this.messages.refresh();this.el('#toast').textContent=translateRendered(this.lastToast);
    this.refreshSelectors();this.renderPresets();this.renderLibrary();this.workbench.refreshLanguage();this.view.refreshLanguage();this.updateHud();this.updateSetupNote();this.updateLanguageButtons();
    if(dialog.open)this.modalRefresh?.();
    dialog.querySelectorAll<HTMLDetailsElement>('details').forEach((el,i)=>el.open=details[i]??el.open);dialog.scrollTop=modalScroll;
    for(const field of fields){if(!field.id)continue;const el=this.root.querySelector<HTMLInputElement|HTMLSelectElement>('#'+field.id);if(!el)continue;el.value=field.value;if(el instanceof HTMLInputElement){el.checked=field.checked;if(field.start!==null)el.setSelectionRange(field.start,field.end);}if(field.focused)el.focus({preventScroll:true});}
    this.persist();window.scrollTo(position.x,position.y);
  }
  private dispose():void {cancelAnimationFrame(this.raf);this.view.dispose();this.sound.dispose();document.removeEventListener('keydown',this.onKey);document.removeEventListener('visibilitychange',this.onVisibility);}
}
