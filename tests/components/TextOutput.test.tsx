import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextOutput } from '../../src/components/TextOutput';
import { I18nProvider } from '../../src/i18n/useTranslation';

function renderOutput(props: {
  result: string | null;
  alternatives?: string[];
  scores?: number[];
  lowConfidence?: boolean;
}) {
  return render(
    <I18nProvider>
      <TextOutput
        result={props.result}
        alternatives={props.alternatives ?? []}
        scores={props.scores ?? []}
        lowConfidence={props.lowConfidence ?? false}
      />
    </I18nProvider>
  );
}

describe('TextOutput', () => {
  it('shows placeholder when no result', () => {
    renderOutput({ result: null });
    expect(screen.getByPlaceholderText(/Result will appear/i)).toBeInTheDocument();
  });

  it('displays the result text', () => {
    renderOutput({ result: 'tôi là bạn' });
    const textarea = screen.getByDisplayValue('tôi là bạn');
    expect(textarea).toHaveAttribute('readonly');
  });

  it('shows low confidence badge when flagged', () => {
    renderOutput({ result: 'tôi', lowConfidence: true });
    expect(screen.getByText(/Low confidence/i)).toBeInTheDocument();
  });

  it('hides low confidence badge when not flagged', () => {
    renderOutput({ result: 'tôi là bạn đi chơi', lowConfidence: false });
    expect(screen.queryByText(/Low confidence/i)).not.toBeInTheDocument();
  });

  it('hides alternatives button when only one result', () => {
    renderOutput({ result: 'tôi là bạn' });
    expect(screen.queryByText(/alternatives/i)).not.toBeInTheDocument();
  });

  it('shows alternatives button when multiple results', () => {
    renderOutput({
      result: 'tôi là bạn',
      alternatives: ['tối lá bạn'],
      scores: [-2.5, -4.0],
    });
    expect(screen.getByText(/Show 1 alternative/i)).toBeInTheDocument();
  });

  it('expands alternatives list on click', () => {
    renderOutput({
      result: 'tôi là bạn',
      alternatives: ['tối lá bạn'],
      scores: [-2.5, -4.0],
    });
    fireEvent.click(screen.getByText(/Show 1 alternative/i));
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('tối lá bạn')).toBeInTheDocument();
  });

  it('switches selected result when clicking an alternative', () => {
    renderOutput({
      result: 'tôi là bạn',
      alternatives: ['tối lá bạn'],
      scores: [-2.5, -4.0],
    });
    fireEvent.click(screen.getByText(/Show 1 alternative/i));
    fireEvent.click(screen.getByText('tối lá bạn'));
    expect(screen.getByDisplayValue('tối lá bạn')).toBeInTheDocument();
  });
});
