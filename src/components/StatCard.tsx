'use client';

import React from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  glowColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, glowColor = 'var(--primary)' }) => {
  return (
    <div 
      className={`${styles.card} glassmorphic glow-on-hover`}
      style={{ '--card-glow-color': glowColor } as React.CSSProperties}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <div className={styles.iconWrapper} style={{ backgroundColor: `rgba(${glowColor === 'var(--primary)' ? '99, 102, 241' : glowColor === 'var(--status-done)' ? '16, 185, 129' : glowColor === 'var(--status-inprogress)' ? '245, 158, 11' : '59, 130, 246'}, 0.15)`, color: glowColor }}>
          {icon}
        </div>
      </div>
      <div className={styles.content}>
        <span className={styles.value}>{value}</span>
        {trend && (
          <div className={`${styles.trend} ${trend.isPositive ? styles.positive : styles.negative}`}>
            <span>{trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%</span>
            <span className={styles.trendLabel}>vs last week</span>
          </div>
        )}
      </div>
    </div>
  );
};
export default StatCard;
