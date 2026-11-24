import type { JSX } from 'react';
import type { PetSpecies } from '../../shared/types';
import { Cat } from './cat';
import { Dog } from './dog';
import { Mushroom } from './mushroom';
import { Rabbit } from './rabbit';
import { Sprout } from './sprout';

/**
 * 桌面宠物形象：按物种选形象，按成长阶段缩放。
 * 阶段外层负责缩放，形象内部负责物种特征与阶段装饰。
 */
export function PetCharacter({
  species,
  stage,
  size,
}: {
  species: PetSpecies;
  stage: number;
  size: number;
}): JSX.Element {
  const level = Math.max(0, Math.min(4, Math.floor(stage)));
  return (
    <div className={`pet-stage pet-stage-${level}`} style={{ width: size, height: size }}>
      {figure(species, level, size)}
    </div>
  );
}

function figure(species: PetSpecies, stage: number, size: number): JSX.Element {
  switch (species) {
    case 'sprout':
      return <Sprout stage={stage} size={size} />;
    case 'cat':
      return <Cat stage={stage} size={size} />;
    case 'dog':
      return <Dog stage={stage} size={size} />;
    case 'rabbit':
      return <Rabbit stage={stage} size={size} />;
    case 'mushroom':
      return <Mushroom stage={stage} size={size} />;
    default:
      throw new Error(`未知的桌面宠物形象：${species}`);
  }
}
