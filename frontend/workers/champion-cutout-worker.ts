import { removeBackground } from '@imgly/background-removal';

// All decoding, matte repair, resampling and sharpening stay off the UI thread.
async function boundedInput(blob:Blob){
  const bitmap=await createImageBitmap(blob),scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  if(scale===1){bitmap.close();return blob;}
  const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale)),ctx=canvas.getContext('2d')!;
  ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.convertToBlob({type:'image/png'});
}
async function finishPortrait(blob:Blob,repair:boolean){
  const bitmap=await createImageBitmap(blob),source=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=source.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(bitmap,0,0);bitmap.close();
  if(repair){
    const ratio=Math.min(1,768/Math.max(source.width,source.height)),w=Math.round(source.width*ratio),h=Math.round(source.height*ratio),small=new OffscreenCanvas(w,h),s=small.getContext('2d',{willReadFrequently:true})!;
    s.drawImage(source,0,0,w,h);const alpha=s.getImageData(0,0,w,h).data,seen=new Uint8Array(w*h),fill=new Uint8Array(w*h),queue=new Int32Array(w*h);
    for(let seed=0;seed<w*h;seed++){
      if(seen[seed]||alpha[seed*4+3]>=160)continue;let head=0,tail=1,border=false,min=255;queue[0]=seed;seen[seed]=1;
      while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);min=Math.min(min,alpha[i*4+3]);if(x===0||y===0||x===w-1||y===h-1)border=true;
        for(let direction=0;direction<4;direction++){const n=direction===0?(x>0?i-1:-1):direction===1?(x<w-1?i+1:-1):direction===2?(y>0?i-w:-1):(y<h-1?i+w:-1);if(n>=0&&!seen[n]&&alpha[n*4+3]<160){seen[n]=1;queue[tail++]=n;}}
      }
      // Repair enclosed translucent speckles in fabric; retain larger openings and fully transparent gaps.
      if(!border&&tail<w*h*.008&&(min>12||tail<24))for(let j=0;j<tail;j++)fill[queue[j]]=1;
    }
    const image=ctx.getImageData(0,0,source.width,source.height),data=image.data;
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
      const i=(y*source.width+x)*4+3,a=data[i],cell=Math.min(h-1,Math.floor(y*ratio))*w+Math.min(w-1,Math.floor(x*ratio));
      if(fill[cell])data[i]=255;else{const t=Math.max(0,Math.min(1,(a-8)/(205-8)));data[i]=Math.round(255*t*t*(3-2*t));}
    }
    ctx.putImageData(image,0,0);
  }
  self.postMessage({type:'progress',key:'upscale',current:0,total:0});
  const longest=Math.max(source.width,source.height),scale=Math.min(2,Math.max(1,1800/longest)),out=new OffscreenCanvas(Math.round(source.width*scale),Math.round(source.height*scale)),o=out.getContext('2d',{willReadFrequently:true})!;
  o.imageSmoothingQuality='high';o.drawImage(source,0,0,out.width,out.height);
  const image=o.getImageData(0,0,out.width,out.height),d=image.data,original=new Uint8ClampedArray(d),stride=out.width*4;
  for(let y=1;y<out.height-1;y++)for(let x=1;x<out.width-1;x++){
    const i=y*stride+x*4;if(original[i+3]<240||original[i-4+3]<240||original[i+4+3]<240||original[i-stride+3]<240||original[i+stride+3]<240)continue;
    for(let c=0;c<3;c++)d[i+c]=original[i+c]+.14*(4*original[i+c]-original[i-4+c]-original[i+4+c]-original[i-stride+c]-original[i+stride+c]);
  }
  o.putImageData(image,0,0);return out.convertToBlob({type:'image/png'});
}
self.onmessage=async(event:MessageEvent<{image:Blob,quality:'fast'|'quality',enhanceOnly?:boolean}>)=>{
  try{
    const {image,quality,enhanceOnly}=event.data,input=await boundedInput(image);
    const cutout=enhanceOnly?input:await removeBackground(input,{publicPath:new URL('/assets/champion-model/1.7.0/',self.location.origin).href,model:quality==='fast'?'isnet_quint8':'isnet_fp16',device:'cpu',progress:(key,current,total)=>self.postMessage({type:'progress',key,current,total}),output:{format:'image/png',quality:1}});
    self.postMessage({type:'done',blob:await finishPortrait(cutout,!enhanceOnly)});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'Falha no recorte.'});}
};
