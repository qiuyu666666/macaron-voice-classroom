// WebRTC owns audio transport; never encode or log microphone samples.
export function voiceSession(enabled,transcribe=false,o={}){
 if(!enabled)return {output_modalities:['text']};
 const turn={type:o.rtVad||'semantic_vad',create_response:o.rtAuto!=='false',interrupt_response:o.rtInterrupt!=='false'};
 if(turn.type==='semantic_vad')turn.eagerness=o.rtEagerness||'high';
 else Object.assign(turn,{threshold:Number(o.rtThreshold??.5),silence_duration_ms:Number(o.rtSilence??500),prefix_padding_ms:Number(o.rtPrefix??300),...(+o.rtIdle?{idle_timeout_ms:+o.rtIdle*1000}:{})});
 const audio={input:{noise_reduction:o.rtNoise==='off'?null:{type:o.rtNoise||'far_field',strength:Number(o.rtStrength??1)},turn_detection:turn}};
 if(o.rtSpeed||o.rtVoiceName)audio.output={speed:Number(o.rtSpeed||1),...(o.rtVoiceName&&o.rtVoiceName!=='default'?{voice:o.rtVoiceName}:{})};
 return {output_modalities:['audio'],audio,...(o.rtEffort&&o.rtEffort!=='default'?{reasoning:{effort:o.rtEffort}}:{})};
}
export async function attachMicrophone(pc,mediaDevices,isCurrent=()=>true,o={}){const stream=await mediaDevices.getUserMedia({audio:{echoCancellation:o.micEcho!=='false',noiseSuppression:o.micNoise!=='false',autoGainControl:o.micGain==='true'}});if(!isCurrent()){stream.getTracks().forEach(t=>t.stop());return null}for(const track of stream.getAudioTracks())pc.addTrack(track,stream);return stream;}
export function releaseMedia(stream,audio){stream?.getTracks().forEach(t=>t.stop());audio.pause();audio.srcObject?.getTracks().forEach(t=>t.stop());audio.srcObject=null;}
export function setMicEnabled(stream,enabled){stream?.getAudioTracks().forEach(t=>{t.enabled=enabled});}
