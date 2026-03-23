import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClipIndicators } from './clip-indicators';

describe('ClipIndicators', () => {
  it('shows a linked-state icon for synced clips', () => {
    render(
      <ClipIndicators
        hasKeyframes={false}
        currentSpeed={1}
        isStretching={false}
        stretchFeedback={null}
        isBroken={false}
        hasMediaId
        isLinked
        isMask={false}
        isShape={false}
      />
    );

    expect(screen.getByTitle('Linked audio/video pair')).toBeInTheDocument();
  });
});
