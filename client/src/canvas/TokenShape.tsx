import { Group, Circle, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Token } from '../../../shared/types';
import { presentAuras, AURA_HEX } from '../lib/conditions';
import type { TokenDisplay } from '../lib/entities';

type Props = {
  token: Token;
  display: TokenDisplay;
  gridSizePx: number;
  draggable: boolean;
  selected: boolean;
  activeTurn: boolean;
  onSelect: (token: Token, additive: boolean) => void;
  onMove: (token: Token, x: number, y: number) => void;
};

const isAdditive = (e: KonvaEventObject<Event>): boolean => {
  const evt = e.evt as MouseEvent;
  return !!(evt.shiftKey || evt.ctrlKey || evt.metaKey);
};

export function TokenShape({
  token,
  display,
  gridSizePx,
  draggable,
  selected,
  activeTurn,
  onSelect,
  onMove,
}: Props) {
  const radius = (gridSizePx * token.size) / 2;
  const auras = presentAuras(display.conditions);
  const fill = token.kind === 'pc' ? '#2d6cdf' : '#b1432f';
  const hpFrac =
    display.maxHp && display.maxHp > 0 && display.curHp !== undefined
      ? Math.max(0, Math.min(1, display.curHp / display.maxHp))
      : null;
  const isDead = display.curHp !== undefined && display.curHp <= 0;

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    onMove(token, e.target.x(), e.target.y());
  };

  return (
    <Group
      name="token"
      x={token.x}
      y={token.y}
      draggable={draggable}
      onClick={(e) => onSelect(token, isAdditive(e))}
      onTap={(e) => onSelect(token, isAdditive(e))}
      onDragEnd={handleDragEnd}
      opacity={token.isHidden ? 0.45 : 1}
    >
      {/* Concentric status rings: red (negative), green (buff), blue (concentration). */}
      {auras.map((a, i) => (
        <Circle
          key={a}
          radius={radius + 5 + i * 5}
          stroke={AURA_HEX[a]}
          strokeWidth={4}
        />
      ))}
      {activeTurn && (
        <Circle
          radius={radius + 8 + auras.length * 5}
          stroke="#f5c518"
          strokeWidth={3}
          dash={[8, 6]}
        />
      )}
      <Circle
        radius={radius}
        fill={fill}
        stroke={selected ? '#ffffff' : '#1118'}
        strokeWidth={selected ? 4 : 2}
        opacity={isDead ? 0.5 : 1}
      />
      {/* Death marker when downed (only where HP is visible to this viewer). */}
      {isDead && (
        <Text
          text="💀"
          fontSize={radius * 1.4}
          width={radius * 2}
          height={radius * 2}
          offsetX={radius}
          offsetY={radius}
          align="center"
          verticalAlign="middle"
        />
      )}
      <Text
        text={display.name}
        fontSize={Math.max(11, gridSizePx * 0.28)}
        fill="#fff"
        align="center"
        width={radius * 4}
        offsetX={radius * 2}
        y={-radius - 18}
      />
      {/* HP bar (only when HP is visible to this viewer). */}
      {hpFrac !== null && (
        <Group y={radius + 4} offsetX={radius}>
          <Rect width={radius * 2} height={6} fill="#0008" cornerRadius={3} />
          <Rect
            width={radius * 2 * hpFrac}
            height={6}
            fill={hpFrac > 0.5 ? '#39c46b' : hpFrac > 0.25 ? '#f5c518' : '#e23b3b'}
            cornerRadius={3}
          />
        </Group>
      )}
      {token.initiative !== null && (
        <Group x={radius * 0.8} y={-radius * 0.8}>
          <Circle radius={11} fill="#f5c518" stroke="#000" strokeWidth={1} />
          <Text
            text={String(token.initiative)}
            fontSize={13}
            fill="#000"
            width={22}
            offsetX={11}
            offsetY={6}
            align="center"
          />
        </Group>
      )}
    </Group>
  );
}
