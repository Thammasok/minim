import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DropZone } from './drop-zone';

function fileAt(path: string, type = 'application/json'): File {
  const name = path.split('/').pop() ?? path;
  const file = new File(['{}'], name, { type });
  Object.defineProperty(file, 'path', { value: path });
  return file;
}

function transfer(files: File[], items?: unknown[]) {
  return {
    files,
    items: items ?? files.map((file) => ({ kind: 'file', type: file.type })),
    types: ['Files'],
  };
}

function drop(dataTransfer: unknown) {
  const event = createEvent.drop(document.body, { dataTransfer });
  fireEvent(document.body, event);
  return event;
}

describe('DropZone', () => {
  // FR-002 — the target is the window, so the listeners are on the window and the overlay is
  // full-bleed. A bordered sub-region would tell the user the rest of the window refuses drops.
  it('shows a window-wide overlay while a file drag is over the window', () => {
    render(<DropZone onPath={vi.fn()} />);
    expect(screen.queryByTestId('drop-overlay')).toBeNull();

    fireEvent.dragEnter(document.body, { dataTransfer: transfer([fileAt('/a/b.json')]) });
    const overlay = screen.getByTestId('drop-overlay');
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');

    fireEvent.dragLeave(document.body, { dataTransfer: transfer([fileAt('/a/b.json')]) });
    expect(screen.queryByTestId('drop-overlay')).toBeNull();
  });

  it('ignores a drag that carries no files', () => {
    render(<DropZone onPath={vi.fn()} />);
    fireEvent.dragEnter(document.body, {
      dataTransfer: { files: [], items: [], types: ['text/plain'] },
    });
    expect(screen.queryByTestId('drop-overlay')).toBeNull();
  });

  it('hands a single .json path to its owner and prevents the browser default', () => {
    const onPath = vi.fn();
    render(<DropZone onPath={onPath} />);

    const event = drop(transfer([fileAt('/a/b.json')]));

    expect(onPath).toHaveBeenCalledExactlyOnceWith('/a/b.json');
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByTestId('drop-rejection')).toBeNull();
  });

  it.each([
    ['two files', transfer([fileAt('/a.json'), fileAt('/b.json')]), /one collection at a time/i],
    [
      'a folder',
      transfer(
        [fileAt('/collections', '')],
        [{ kind: 'file', type: '', webkitGetAsEntry: () => ({ isDirectory: true }) }]
      ),
      /folder/i,
    ],
    ['a non-json file', transfer([fileAt('/a/notes.txt', 'text/plain')]), /\.json/i],
  ])('rejects %s inline without invoking anything', (_label, dataTransfer, message) => {
    const onPath = vi.fn();
    render(<DropZone onPath={onPath} />);

    drop(dataTransfer);

    expect(onPath).not.toHaveBeenCalled();
    expect(screen.getByTestId('drop-rejection')).toHaveTextContent(message);
  });

  it('clears a previous rejection when a new drag starts', () => {
    render(<DropZone onPath={vi.fn()} />);
    drop(transfer([fileAt('/a.json'), fileAt('/b.json')]));
    expect(screen.getByTestId('drop-rejection')).toBeInTheDocument();

    fireEvent.dragEnter(document.body, { dataTransfer: transfer([fileAt('/a/b.json')]) });
    expect(screen.queryByTestId('drop-rejection')).toBeNull();
  });

  it('ignores drops while disabled, but still stops the webview navigating to the file', () => {
    const onPath = vi.fn();
    render(<DropZone onPath={onPath} disabled />);

    const event = drop(transfer([fileAt('/a/b.json')]));

    expect(onPath).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('stops listening once unmounted', () => {
    const onPath = vi.fn();
    const { unmount } = render(<DropZone onPath={onPath} />);
    unmount();

    drop(transfer([fileAt('/a/b.json')]));
    expect(onPath).not.toHaveBeenCalled();
  });
});
