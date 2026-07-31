export interface IconProps {
    size?: number;
    color?: string;
    className?: string;
    style?: React.CSSProperties;
}
export type IconComponent = (props: IconProps) => React.ReactElement;
