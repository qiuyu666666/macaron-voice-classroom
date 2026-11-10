import{voiceActions}from'./public/voice-action.mjs';
export function courseActionError(text){const markers=text.match(/^```(?:courseware|voice-call)\b/gm)||[];if(!markers.length)return null;const actions=voiceActions(text);if(actions.length!==markers.length)return '通话邀请格式无效：使用完整的 courseware 围栏和 JSON 字符串 label、goal、course_brief';return null}
export async function repairCourseReply(text,generate){const error=courseActionError(text);if(!error)return text;const fixed=await generate(error);if(courseActionError(fixed)||!voiceActions(fixed).length)throw Error('通话邀请格式修正失败，未创建邀请卡');return fixed}
