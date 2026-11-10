// A single context hint per exchange. The voice model still decides whether to speak.
export class LivePause {
  constructor(delay=5000){this.delay=delay;this.active=false;this.hinted=false;this.last=0}
  activity(kind,now){
    if(kind==='user'||kind==='interaction')this.hinted=false;
    this.active=true;this.last=now;
  }
  check(now,available){
    if(!available){this.last=now;return false}
    if(!this.active||this.hinted||now-this.last<this.delay)return false;
    this.hinted=true;return true;
  }
}
