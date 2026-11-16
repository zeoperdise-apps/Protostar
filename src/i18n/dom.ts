import { en, ja, type MessageKey } from './messages';
import { t } from './index';
/** Bind exact dictionary messages once so language changes preserve live DOM and inputs. */
export class DOMMessages {
  private text = new Map<Text,{key:MessageKey;leading:string;trailing:string}>();
  private attributes = new Map<Element,Map<string,MessageKey>>();
  bind(root: HTMLElement): void {
    const lookup = new Map<string,MessageKey>();
    for(const key of Object.keys(ja) as MessageKey[]) { lookup.set(ja[key].trim(),key); lookup.set(en[key].trim(),key); }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const value=node.textContent||'',key=lookup.get(value.trim());
      if(key)this.text.set(node as Text,{key,leading:value.match(/^\s*/)?.[0]||'',trailing:value.match(/\s*$/)?.[0]||''});
    }
    for(const el of [root,...root.querySelectorAll('*')])for(const name of ['aria-label','title','placeholder']) {
      const value=el.getAttribute(name),key=value?lookup.get(value.trim()):undefined;
      if(key){if(!this.attributes.has(el))this.attributes.set(el,new Map());if(!this.attributes.get(el)!.has(name))this.attributes.get(el)!.set(name,key);}
    }
  }
  refresh():void {
    for(const [node,binding] of this.text)if(node.isConnected)node.textContent=binding.leading+t(binding.key).trim()+binding.trailing;else this.text.delete(node);
    for(const [el,attrs]of this.attributes)if(el.isConnected)for(const [name,key]of attrs)el.setAttribute(name,t(key));else this.attributes.delete(el);
  }
}
