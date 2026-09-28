import { TestBed } from '@angular/core/testing';
import { FileUploader, fileProblem } from './file-uploader';

describe('fileProblem', () => {
  it('accepts allowed types within the size limit', () => {
    expect(fileProblem({ name: 'Site Plan.PDF', size: 2048 })).toBeNull();
  });

  it('refuses other types, empty files and files over 10 MB', () => {
    expect(fileProblem({ name: 'script.exe', size: 10 })).toContain("can't be attached");
    expect(fileProblem({ name: 'README', size: 10 })).toContain("can't be attached");
    expect(fileProblem({ name: 'empty.txt', size: 0 })).toBe('empty.txt is empty.');
    expect(fileProblem({ name: 'big.pdf', size: 10 * 1024 * 1024 + 1 })).toContain('at most 10 MB');
  });
});

describe('FileUploader', () => {
  async function render() {
    const fixture = TestBed.createComponent(FileUploader);
    const selected: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file) => selected.push(file));
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;

    const choose = async (file: File) => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    return { fixture, el, input, selected, choose };
  }

  it('labels the file input', async () => {
    const { input } = await render();

    expect(input.labels?.[0]?.textContent).toBe('Upload file');
    expect(input.getAttribute('accept')).toContain('.pdf');
  });

  it('passes on an allowed file', async () => {
    const { selected, choose, el } = await render();

    await choose(new File(['plan'], 'plan.pdf'));

    expect(selected.map((f) => f.name)).toEqual(['plan.pdf']);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('refuses a disallowed file and says why', async () => {
    const { selected, choose, el, input } = await render();

    await choose(new File(['x'], 'virus.exe'));

    expect(selected).toEqual([]);
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("virus.exe can't be attached");
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('shows an error from the server', async () => {
    const { fixture, el } = await render();

    fixture.componentRef.setInput('error', 'The file is empty.');
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toBe('The file is empty.');
  });
});
