import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRACK_SECTION_DIVIDER_HEIGHT } from '@/features/timeline/constants';
import { TrackRowFrame, TrackSectionDivider } from './track-row-frame';

describe('TrackRowFrame', () => {
  it('renders a divider for every wrapped row, including the last row', () => {
    render(
      <>
        <TrackRowFrame>
          <div>Video</div>
        </TrackRowFrame>
        <TrackRowFrame>
          <div>Audio</div>
        </TrackRowFrame>
      </>
    );

    expect(screen.getAllByTestId('track-row-divider')).toHaveLength(2);
  });

  it('anchors the divider to the row and keeps it out of hit testing', () => {
    const { container } = render(
      <TrackRowFrame showTopDivider>
        <div>Track</div>
      </TrackRowFrame>
    );

    const row = container.firstElementChild as HTMLDivElement | null;
    const topDivider = screen.getByTestId('track-row-top-divider');
    const divider = screen.getByTestId('track-row-divider');

    expect(row?.className).toContain('relative');
    expect(topDivider.className).toContain('top-0');
    expect(divider.className).toContain('pointer-events-none');
    expect(divider.className).toContain('bottom-0');
  });

  it('renders the section divider as its own reserved row', () => {
    const { container } = render(<TrackSectionDivider />);

    const row = container.firstElementChild as HTMLDivElement | null;
    const divider = screen.getByTestId('track-row-section-divider');

    expect(row).toHaveStyle({ height: `${TRACK_SECTION_DIVIDER_HEIGHT}px` });
    expect(divider.className).toContain('absolute');
    expect(divider.className).toContain('inset-0');
  });
});
