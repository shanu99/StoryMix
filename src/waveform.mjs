/** Reduce a decoded AudioBuffer into peak amplitudes for timeline previews. */
export function extractPeaks(audioBuffer, buckets=160){
 if(!audioBuffer||!audioBuffer.length||!audioBuffer.numberOfChannels||!Number.isInteger(buckets)||buckets<1)throw Error('Invalid waveform input');
 const length=audioBuffer.length, count=Math.min(buckets,length), peaks=new Array(count).fill(0);
 for(let channel=0;channel<Math.min(2,audioBuffer.numberOfChannels);channel++){
  const samples=audioBuffer.getChannelData(channel);
  for(let bucket=0;bucket<count;bucket++){
   const begin=Math.floor(bucket*length/count),end=Math.max(begin+1,Math.floor((bucket+1)*length/count));
   let peak=0;
   const stride=Math.max(1,Math.floor((end-begin)/100));
   for(let i=begin;i<end;i+=stride)peak=Math.max(peak,Math.abs(samples[i]||0));
   peaks[bucket]=Math.max(peaks[bucket],peak);
  }
 }
 return peaks;
}
export function waveformSvg(peaks,{width=500,height=36,color='#49d4bd'}={}){
 const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height)),bar=Math.max(.5,w/Math.max(1,peaks.length));
 const shapes=peaks.map((v,i)=>{const amp=Math.max(2,Math.max(0,Math.min(1,v))*h*.9);return '<rect x="'+(i*bar).toFixed(2)+'" y="'+((h-amp)/2).toFixed(2)+'" width="'+Math.max(.4,bar*.66).toFixed(2)+'" height="'+amp.toFixed(2)+'" rx=".5"/>'}).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><g fill="'+color+'" opacity=".8">'+shapes+'</g></svg>';
}
