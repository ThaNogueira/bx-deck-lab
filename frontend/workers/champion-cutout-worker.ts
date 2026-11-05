import { removeBackground } from '@imgly/background-removal';
self.onmessage=async(event:MessageEvent<Blob>)=>{
  try{
    const blob=await removeBackground(event.data,{publicPath:new URL('/assets/champion-model/1.7.0/',self.location.origin).href,model:'isnet_quint8',device:'cpu',progress:(key,current,total)=>self.postMessage({type:'progress',key,current,total}),output:{format:'image/png',quality:1}});
    self.postMessage({type:'done',blob});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'Falha no recorte.'});}
};
