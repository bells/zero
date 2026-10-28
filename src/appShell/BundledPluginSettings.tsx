import { lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { BundledPluginSettingsProps } from '../core/pluginHost/pluginModule';
import { bundledPluginModule } from './bundledPluginModules';
const components=new Map<string,LazyExoticComponent<ComponentType<BundledPluginSettingsProps>>>();
export function BundledPluginSettings({pluginId,...props}:BundledPluginSettingsProps & {pluginId:string}){
  const loader=bundledPluginModule(pluginId)?.loadSettings;
  if(!loader)return null;
  let Settings=components.get(pluginId);
  if(!Settings){Settings=lazy(loader);components.set(pluginId,Settings);}
  return <Suspense fallback={<p aria-busy="true">…</p>}><Settings {...props}/></Suspense>;
}
