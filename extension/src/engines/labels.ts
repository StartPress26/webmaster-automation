import type { Engine } from '../types';

// 화면에 표시하는 검색엔진 이름
export const ENGINE_NAMES: Readonly<Record<Engine, string>> = {
  google: 'Google',
  naver: '네이버',
  bing: 'Bing',
};

// 엔진 기호 배지에 쓰는 한 글자를 돌려줍니다. Google은 G, 네이버는 N, Bing은 b입니다.
export function engineSymbol(engine: Engine): string {
  if (engine === 'google') return 'G';
  if (engine === 'naver') return 'N';
  return 'b';
}
