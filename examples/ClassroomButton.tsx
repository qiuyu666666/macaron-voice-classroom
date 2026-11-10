// Integration example for an existing React/TSX lesson (not compiled by this dependency-free console).
// Inject the current session transport's send function; never put an API key in this component.
type Props = { sendEvent: (event: unknown) => void };
export function ClassroomButton({ sendEvent }: Props) {
  return <button onClick={() => sendEvent({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{
      type: 'input_text', text: JSON.stringify({
        source: 'classroom_ui', event: 'click', lesson_id: 'series-circuit', target: '灯泡 2'
      })
    }] }
  })}>灯泡 2</button>;
}
