import { SlideGroup, SlideItem } from './SlideGroup';

/**
 * A segmented control: the selected option is marked by one light-red highlight that slides (and stretches)
 * from option to option. `items`: [{ key, content, style }] where content is the transparent pressable.
 */
export default function SlidingSegment({ items, value, style, pillStyle, inset = 0 }) {
  return (
    <SlideGroup style={style} pillStyle={pillStyle} inset={inset}>
      {items.map((it) => (
        <SlideItem key={it.key} active={it.key === value} style={it.style}>{it.content}</SlideItem>
      ))}
    </SlideGroup>
  );
}
