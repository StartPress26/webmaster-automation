// ─────────────────────────────────────────────────────────────
// 타입·상수
// ─────────────────────────────────────────────────────────────

type Value = string | boolean;
type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// "화면:폼id" → { 입력칸 이름: 값 } 형태로 보존한 초안
export type FormDrafts = ReadonlyMap<string, Readonly<Record<string, Value>>>;

// 다시 그린 뒤에도 절대 복원하지 않는 비밀 입력칸 이름 (IndexNow 키)
const SECRET_FIELD_NAMES: readonly string[] = ['indexnowKey', 'indexnowLocation'];
// 값을 보존하지 않는 input 종류
const SKIPPED_INPUT_TYPES: readonly string[] = ['password', 'file', 'hidden'];

// ─────────────────────────────────────────────────────────────
// 입력칸 판별
// ─────────────────────────────────────────────────────────────

// 폼 요소가 값을 가진 입력칸(input·select·textarea)인지 확인합니다.
function isFieldElement(element: Element): element is FieldElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

// 이름이 없거나, 비밀 칸이거나, 비밀번호·파일·숨김 칸이거나, 선택되지 않은 라디오면 보존하지 않습니다.
function shouldCapture(element: FieldElement): boolean {
  if (!element.name) return false;
  if (SECRET_FIELD_NAMES.includes(element.name)) return false;
  if (element instanceof HTMLInputElement) {
    if (SKIPPED_INPUT_TYPES.includes(element.type)) return false;
    if (element.type === 'radio' && !element.checked) return false;
  }
  return true;
}

// 보존 대상 입력칸인지 한 번에 판별합니다 (filter용 타입 가드).
function isCapturableField(element: Element): element is FieldElement {
  return isFieldElement(element) && shouldCapture(element);
}

// 체크박스는 체크 여부를, 나머지는 문자열 값을 보존합니다.
function fieldValue(element: FieldElement): Value {
  if (element instanceof HTMLInputElement && element.type === 'checkbox') {
    return element.checked;
  }
  return element.value;
}

// 화면(scope)과 폼 id를 묶어 초안 저장 키를 만듭니다.
function draftKey(scope: string, formId: string): string {
  return `${scope}:${formId}`;
}

// ─────────────────────────────────────────────────────────────
// 보존·복원
// ─────────────────────────────────────────────────────────────

// 폼 하나의 보존 대상 입력값을 { 이름: 값 } 객체로 모읍니다.
function collectDraft(form: HTMLFormElement): Readonly<Record<string, Value>> {
  const pairs = Array.from(form.elements)
    .filter(isCapturableField)
    .map((element): readonly [string, Value] => [element.name, fieldValue(element)]);
  return Object.fromEntries(pairs);
}

// 다시 그리기 전에 비밀값을 제외한 폼 입력을 화면·사이트 범위별로 보존합니다.
export function captureFormDrafts(
  root: HTMLElement,
  scope: string,
  previous: FormDrafts,
): FormDrafts {
  let drafts = previous;

  for (const form of root.querySelectorAll<HTMLFormElement>('form[id]')) {
    drafts = new Map([...drafts, [draftKey(scope, form.id), collectDraft(form)]]);
  }

  return drafts;
}

// 보존된 값을 입력칸 하나에 되돌립니다. 체크박스는 체크 여부, 라디오는 값 일치 여부, 나머지는 문자열만 복원합니다.
function restoreField(element: FieldElement, value: Value): void {
  if (element instanceof HTMLInputElement && element.type === 'checkbox') {
    element.checked = value === true;
    return;
  }
  if (element instanceof HTMLInputElement && element.type === 'radio') {
    element.checked = element.value === value;
    return;
  }
  if (typeof value === 'string') {
    element.value = value;
  }
}

// 같은 화면·사이트의 입력만 복원하며 키 입력은 복원하지 않습니다.
export function restoreFormDrafts(root: HTMLElement, scope: string, drafts: FormDrafts): void {
  for (const form of root.querySelectorAll<HTMLFormElement>('form[id]')) {
    const values = drafts.get(draftKey(scope, form.id));
    if (!values) continue;

    for (const element of Array.from(form.elements)) {
      if (!isFieldElement(element)) continue;

      const value = values[element.name];
      if (value === undefined) continue;

      restoreField(element, value);
    }
  }
}
