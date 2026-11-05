type Value = string | boolean;
export type FormDrafts = ReadonlyMap<string, Readonly<Record<string, Value>>>;

// 다시 그리기 전에 비밀값을 제외한 폼 입력을 화면·사이트 범위별로 보존합니다.
export function captureFormDrafts(root: HTMLElement, scope: string, previous: FormDrafts): FormDrafts {
  let drafts = previous;
  for (const form of root.querySelectorAll<HTMLFormElement>('form[id]')) {
    const pairs = Array.from(form.elements).flatMap((element): readonly [string, Value][] => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name) return [];
      if (['indexnowKey', 'indexnowLocation'].includes(element.name)) return [];
      if (element instanceof HTMLInputElement && (['password', 'file', 'hidden'].includes(element.type) || (element.type === 'radio' && !element.checked))) return [];
      return [[element.name, element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element.value]];
    });
    drafts = new Map([...drafts, [`${scope}:${form.id}`, Object.fromEntries(pairs)]]);
  }
  return drafts;
}

// 같은 화면·사이트의 입력만 복원하며 키 입력은 복원하지 않습니다.
export function restoreFormDrafts(root: HTMLElement, scope: string, drafts: FormDrafts): void {
  for (const form of root.querySelectorAll<HTMLFormElement>('form[id]')) {
    const values = drafts.get(`${scope}:${form.id}`);
    if (!values) continue;
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const value = values[element.name];
      if (value === undefined) continue;
      if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = value === true;
      else if (element instanceof HTMLInputElement && element.type === 'radio') element.checked = element.value === value;
      else if (typeof value === 'string') element.value = value;
    }
  }
}
