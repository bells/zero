export function safeOriginalImageName(name: string): string {
 const leaf=(name.split(/[\\/]/).pop()??'image').replace(/[\x00-\x1f\x7f<>:"|?*]/g,'_').replace(/[. ]+$/,'').slice(0,180);
 if(!leaf||/^\.+$/.test(leaf))return 'image';
 return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(leaf)?`_${leaf}`:leaf;
}
export function previewLongEdge(width:number,height:number,pixelLimit:number,requested:number|null):number {
 const scale=Math.min(1,Math.sqrt(pixelLimit/(width*height)));
 const bounded=scale===1?Math.max(width,height):Math.max(1,Math.floor(Math.max(width,height)*scale)-1);
 return requested===null?bounded:Math.min(requested,bounded);
}
