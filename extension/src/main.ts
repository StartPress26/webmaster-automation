import './styles.css';
import { loadWorkspace } from './app/loaders.ts';
import { handleDialogKeyboard } from './app/events.ts';
import { render } from './app/render.ts';
import { demo } from './app/store.ts';

// 관리 화면의 진입점. 상태·화면·동작은 app/ 아래 파일로 나뉘어 있습니다.
// 모듈을 평가하면서 바로 키보드 처리기를 연결하고 첫 화면을 그린 뒤, API 모드면 서버에서 목록을 읽습니다.
document.addEventListener('keydown', handleDialogKeyboard);
render();
if (!demo) void loadWorkspace();
