import { t } from '../i18n';
import { catalog, presets, diagnosticMessage } from '../i18n/display';
import { makeChip, validateProgram } from '../game/program';
import type { Chip, ChipCategory, ChipKind, Direction, Program, RobotDesign, BattleSnapshot } from '../game/types';
import { esc, icon } from './dom';

const categories: Record<ChipCategory,string> = { flow:'フロー', movement:'移動', sensor:'センサー', diagnostic:'診断', weapon:'武器' };
const arrows: Record<Direction,string> = {N:'↑',E:'→',S:'↓',W:'←'};
export class Workbench {
  private selected = 16;
  private category: ChipCategory | 'all' = 'all';
  private search = '';
  private zoom = 1;
  private history = new Map<string,Program[]>();
  private robotId = '';
  private current: number | null = null;
  constructor(private host: HTMLElement, private getRobot: () => RobotDesign, private changed: () => void, private tryBattle: () => void, private template: (presetId: string) => void) {
    host.addEventListener('click', event => this.click(event));
    host.addEventListener('change', event => this.change(event));
    host.addEventListener('input', event => {
      if((event.target as HTMLElement).id==='chip-search') {this.search=(event.target as HTMLInputElement).value; this.renderPalette();}
    });
    host.addEventListener('keydown', event => {
      if(event.key==='Delete' && (event.target as HTMLElement).classList.contains('chip-cell')) {event.preventDefault();this.edit(null);}
      if(event.key==='z' && (event.ctrlKey||event.metaKey) && !(event.target instanceof HTMLInputElement)) {event.preventDefault();this.undo();}
    });
  }
  render(): void {
    const robot=this.getRobot();
    if(this.robotId!==robot.id) {this.robotId=robot.id;this.selected=robot.program.cells.findIndex(c=>c?.kind==='Start');if(this.selected<0)this.selected=0;}
    this.host.innerHTML=`<div class="workbench-layout"><aside class="panel palette-panel"><div class="panel-heading"><span>${t("チップパレット")}</span><span class="micro">19 CHIPS</span></div><div class="palette-search"><input id="chip-search" type="search" aria-label="${t("チップ検索")}" placeholder="${t("チップを検索…")}" value="${esc(this.search)}"></div><div class="category-filter">${(['all',...Object.keys(categories)] as const).map(c=>`<button data-category="${c}" class="${this.category===c?'active':''}">${c==='all'?t("全て"):t(categories[c as ChipCategory] as Parameters<typeof t>[0])}</button>`).join('')}</div><div id="chip-palette" class="chip-palette"></div><p class="palette-note">${t("セルを選択 → チップを選んで配置。")}<br>${t("分岐はYES / NOを設定します。")}</p></aside><section class="panel board-panel"><div class="board-toolbar"><span class="micro">PROGRAM GRID <b>16 × 16</b></span><div class="button-group"><button data-editor="undo" title="${t("元に戻す (Ctrl+Z)")}" aria-label="${t("元に戻す")}">${icon('undo',16)}</button><button data-editor="zoom-out" aria-label="${t("盤を縮小")}">−</button><span id="zoom-label">${Math.round(this.zoom*100)}%</span><button data-editor="zoom-in" aria-label="${t("盤を拡大")}">＋</button><button data-editor="fit">${t("全体")}</button></div></div><div class="board-scroll" tabindex="0" aria-label="${t("16行16列のAIチップ盤。横にスクロールできます")}"><div class="board-wrap" style="--cell:${36*this.zoom}px"><div class="column-labels">${Array.from({length:16},(_,i)=>`<span>${i.toString(16).toUpperCase()}</span>`).join('')}</div><div class="row-labels">${Array.from({length:16},(_,i)=>`<span>${i.toString(16).toUpperCase()}</span>`).join('')}</div><div id="chip-board" class="chip-board" role="grid" aria-label="${t("AIプログラム")}"></div></div></div><div class="board-legend"><span class="legend-dot cat-flow"></span> ${t("フロー")} <span class="legend-dot cat-movement"></span> ${t("移動")} <span class="legend-dot cat-sensor"></span> ${t("センサー")} <span class="legend-dot cat-diagnostic"></span> ${t("診断")} <span class="legend-dot cat-weapon"></span> ${t("武器")}</div><div class="board-foot"><span>${t("通常 →")} <span class="cyan">YES →</span> <span class="coral">NO →</span></span><span>${t("空リンクはSTARTへ戻ります")}</span></div></section><aside class="editor-aside"><section class="panel"><div class="panel-heading"><span>${t("セルインスペクター")}</span>${icon('chip',16)}</div><div id="inspector" class="inspector"></div></section><section class="panel"><div class="panel-heading"><span>${t("プログラム診断")}</span><span id="diagnostic-count" class="micro"></span></div><div id="diagnostics" class="diagnostics"></div></section><button class="button primary full" data-editor="try">${icon('play')}${t("このAIで試す")}</button><details class="mini-guide"><summary>${t("矢印・ジャンプの使い方")}</summary><p>${t("STARTは必ず1個。矢印は隣のセルへ進みます。条件チップはYESとNOを別々に設定。ENDはSTARTへ戻り、JUMPは同名のLABEL A〜Eへ移動します。")}</p><p>${t("チップを消す: 選択セルにフォーカスしてDelete。空白盤にもパレットからSTARTを置けます。")}</p><label>${t("プリセットを新規機体に複製")}<select id="editor-template"><option value="">${t("テンプレートを選択…")}</option></select></label></details></aside></div>`;
    this.renderPalette(); this.renderBoard(); this.renderInspector(); this.renderDiagnostics(); this.renderUndo();
  }
  refreshLanguage():void {
    const scroll=this.host.querySelector<HTMLElement>('.board-scroll');
    const position={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
    const details=this.host.querySelector<HTMLDetailsElement>('.mini-guide')?.open;
    this.render();this.setTemplates(presets());
    const next=this.host.querySelector<HTMLElement>('.board-scroll');if(next){next.scrollLeft=position.left;next.scrollTop=position.top;}
    const guide=this.host.querySelector<HTMLDetailsElement>('.mini-guide');if(guide)guide.open=!!details;
  }
  setTemplates(templates: readonly {id:string;name:string}[]):void {
    const select=this.host.querySelector('#editor-template'); if(select)select.innerHTML=`<option value="">${t("テンプレートを選択…")}</option>`+templates.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  }
  private renderPalette():void {
    const palette=this.host.querySelector('#chip-palette'); if(!palette)return;
    const list=catalog().CHIPS.filter(chip=>(this.category==='all'||chip.category===this.category)&&`${chip.name} ${chip.kind} ${chip.description}`.toLowerCase().includes(this.search.toLowerCase()));
    palette.innerHTML=list.map(chip=>`<button class="palette-chip cat-${chip.category}" data-chip="${chip.kind}" title="${esc(chip.description)}"><span class="palette-symbol">${chip.conditional?'◇':chip.kind==='Start'?'▶':chip.kind==='End'?'END':chip.kind==='FireLeft'||chip.kind==='FireRight'?'⊕':chip.kind==='Forward'?'↑':chip.kind==='Backward'?'↓':chip.short}</span><span><b>${chip.name}</b><small>${esc(chip.short)}</small></span>${chip.conditional?'<span class="branch-sign">Y/N</span>':''}</button>`).join('') || `<p class="muted">${t("該当するチップはありません")}</p>`;
  }
  private renderBoard():void {
    const board=this.host.querySelector('#chip-board'); if(!board)return;
    board.innerHTML=this.getRobot().program.cells.map((chip,i)=>{
      const definition=chip?catalog().CHIP_CATALOG[chip.kind]:null;
      const coordinate=`${(i%16).toString(16).toUpperCase()},${Math.floor(i/16).toString(16).toUpperCase()}`;
      return `<button class="chip-cell ${definition?'cat-'+definition.category:'empty'} ${i===this.selected?'selected':''} ${i===this.current?'executing':''}" role="gridcell" data-cell="${i}" aria-label="${t("セル")} ${coordinate} ${definition?.name||t("空白")}" aria-selected="${i===this.selected}" title="${coordinate} / ${definition?.name||t("空白")}"><span class="cell-short">${definition?esc(definition.short):''}</span>${chip?.param!==undefined?`<span class="cell-param">${esc(chip.param)}</span>`:''}${chip&&definition?.conditional?`<span class="cell-arrows"><i class="cyan">${arrows[chip.yes||'E']}</i><i class="coral">${arrows[chip.no||'S']}</i></span>`:chip&&!['End','Jump'].includes(chip.kind)?`<span class="cell-arrows">${arrows[chip.next||'E']}</span>`:''}</button>`;
    }).join('');
  }
  private renderInspector():void {
    const host=this.host.querySelector('#inspector'); if(!host)return;
    const chip=this.getRobot().program.cells[this.selected],definition=chip?catalog().CHIP_CATALOG[chip.kind]:null;
    const arrowSelect=(key:'next'|'yes'|'no',label:string)=>`<label>${label}<select data-prop="${key}">${(['N','E','S','W'] as Direction[]).map(d=>`<option value="${d}" ${chip?.[key]===d || !chip?.[key]&&d===(key==='no'?'S':'E')?'selected':''}>${arrows[d]} ${d==='N'?t("上"):d==='E'?t("右"):d==='S'?t("下"):t("左")}</option>`).join('')}</select></label>`;
    host.innerHTML=`<div class="cell-coordinate"><span>CELL</span><b>${(this.selected%16).toString(16).toUpperCase()} : ${Math.floor(this.selected/16).toString(16).toUpperCase()}</b><small>#${this.selected}</small></div><label>${t("チップ")}<select id="inspector-kind"><option value="">${t("空白")}</option>${catalog().CHIPS.map(d=>`<option value="${d.kind}" ${chip?.kind===d.kind?'selected':''}>${d.name}</option>`).join('')}</select></label>${definition?`<p class="chip-description">${esc(definition.description)}</p>${definition.params?`<label>${t("パラメーター")}<select data-prop="param">${definition.params.some(p=>p.value===chip?.param)?'':`<option value="${esc(chip?.param)}">${esc(chip?.param)}</option>`}${definition.params.map(p=>`<option value="${esc(p.value)}" ${p.value===chip?.param?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label>`:''}${definition.conditional?`<div class="branch-inputs">${arrowSelect('yes',t("YES の矢印"))}${arrowSelect('no',t("NO の矢印"))}</div>`:!['End','Jump'].includes(chip!.kind)?arrowSelect('next',t("次へ進む矢印")):''}<button class="button danger subtle full" data-editor="delete">${icon('trash',15)}${t("このチップを削除")}</button>`:`<p class="chip-description">${t("空白セルです。左のパレットからチップを選んで配置してください。")}</p>`}<div class="autosave-note">${icon('check',13)} ${t("変更は自動保存")}</div>`;
  }
  private renderDiagnostics():void {
    const diagnostics=validateProgram(this.getRobot().program),errors=diagnostics.filter(d=>d.severity==='error').length;
    const count=this.host.querySelector('#diagnostic-count');if(count)count.textContent=errors?`${errors} ERRORS`:`${diagnostics.length} WARNINGS`;
    const host=this.host.querySelector('#diagnostics');if(host)host.innerHTML=diagnostics.length?diagnostics.map(d=>`<button class="diagnostic ${d.severity}" data-diagnostic="${d.cell??-1}"><b>${d.severity==='error'?'ERROR':'WARN'}${d.cell!==undefined?` / ${d.x},${d.y}`:''}</b><span>${esc(diagnosticMessage(d))}</span></button>`).join(''):'<div class="diagnostic valid">'+icon('check',16)+` ${t("問題はありません。実行できます。")}</div>`;
  }
  private renderUndo():void {const undo=this.host.querySelector<HTMLButtonElement>('[data-editor="undo"]');if(undo)undo.disabled=!this.history.get(this.robotId)?.length;}
  private click(event: Event):void {
    const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(!target)return;
    if(target.dataset.cell!==undefined){this.selected=Number(target.dataset.cell);this.renderBoard();this.renderInspector();this.host.querySelector<HTMLButtonElement>(`[data-cell="${this.selected}"]`)?.focus({preventScroll:true});}
    if(target.dataset.chip)this.edit(makeChip(target.dataset.chip as ChipKind));
    if(target.dataset.category){this.category=target.dataset.category as typeof this.category;this.host.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.category===this.category));this.renderPalette();}
    if(target.dataset.diagnostic!==undefined){this.selected=Math.max(0,Number(target.dataset.diagnostic));this.renderBoard();this.renderInspector();this.host.querySelector(`[data-cell="${this.selected}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});}
    if(target.dataset.editor==='delete')this.edit(null);
    if(target.dataset.editor==='undo')this.undo();
    if(target.dataset.editor==='try')this.tryBattle();
    if(['zoom-in','zoom-out','fit'].includes(target.dataset.editor||'')){
      const scroll=this.host.querySelector<HTMLElement>('.board-scroll')!;
      this.zoom=target.dataset.editor==='fit'?Math.max(.45,Math.min(1,(scroll.clientWidth-36)/(16*36))):Math.min(1.5,Math.max(.5,this.zoom+(target.dataset.editor==='zoom-in'?.15:-.15)));
      this.host.querySelector<HTMLElement>('.board-wrap')!.style.setProperty('--cell',`${36*this.zoom}px`);this.host.querySelector('#zoom-label')!.textContent=`${Math.round(this.zoom*100)}%`;
    }
  }
  private change(event: Event):void {
    const target=event.target as HTMLSelectElement;
    if(target.id==='inspector-kind')this.edit(target.value?makeChip(target.value as ChipKind):null);
    if(target.dataset.prop){
      const chip=this.getRobot().program.cells[this.selected];if(!chip)return;
      const updated={...chip},key=target.dataset.prop;
      if(key==='param'){const param=catalog().CHIP_CATALOG[chip.kind].params?.find(p=>String(p.value)===target.value);updated.param=param?.value??chip.param;}
      else updated[key as 'next'|'yes'|'no']=target.value as Direction;
      this.edit(updated);
    }
    if(target.id==='editor-template'&&target.value)this.template(target.value);
  }
  private edit(chip: Chip|null):void {
    const robot=this.getRobot(),stack=this.history.get(robot.id)||[];stack.push(structuredClone(robot.program));if(stack.length>100)stack.shift();this.history.set(robot.id,stack);
    robot.program.cells[this.selected]=chip;this.changed();this.renderBoard();this.renderInspector();this.renderDiagnostics();this.renderUndo();
  }
  private undo():void {
    const program=this.history.get(this.robotId)?.pop();if(!program)return;this.getRobot().program=program;this.changed();this.renderBoard();this.renderInspector();this.renderDiagnostics();this.renderUndo();
  }
  updateExecution(snapshot: BattleSnapshot):void {
    const robot=snapshot.robots.find(r=>r.designId===this.getRobot().id),current=robot?.currentCell??null;
    if(current===this.current)return;
    this.current=current;this.host.querySelectorAll('.executing').forEach(cell=>cell.classList.remove('executing'));if(current!==null)this.host.querySelector(`[data-cell="${current}"]`)?.classList.add('executing');
  }
}
