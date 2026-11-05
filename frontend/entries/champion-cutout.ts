export async function removeChampionBackground(image:Blob, progress:(key:string,current:number,total:number)=>void){
  return new Promise<Blob>((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/champion-cutout-worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=event=>{const data=event.data;if(data.type==='progress')progress(data.key,data.current,data.total);else{worker.terminate();if(data.type==='done')resolve(data.blob);else reject(new Error(data.message||'O recorte não pôde ser concluído.'));}};
    worker.onerror=()=>{worker.terminate();reject(new Error('Não foi possível iniciar o recorte automático.'));};
    worker.postMessage(image);
  });
}
