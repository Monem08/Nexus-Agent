export default function Toast({ toast }) {
  return <div className={'toast' + (toast?.show ? ' show' : '') + (toast?.err ? ' err' : '')}>{toast?.msg}</div>;
}
