"""
运行此脚本生成 PWA 图标
需要安装: pip install Pillow

运行方法:
  cd ai-chat-hub
  python generate_icons.py
  
生成的文件会放在 public/icons/ 目录
"""

from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('public/icons', exist_ok=True)

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 背景圆角矩形
    radius = size // 5
    bg_color = (99, 102, 241)  # indigo
    draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=bg_color)
    
    # 聊天气泡图案
    margin = size // 6
    bubble_w = size - margin * 2
    bubble_h = int(size * 0.55)
    bubble_r = size // 8
    draw.rounded_rectangle([margin, margin, margin + bubble_w, margin + bubble_h], radius=bubble_r, fill='white')
    
    # 三条文字线
    line_color = bg_color
    line_h = size // 20
    lm = margin + size // 10
    y1 = margin + bubble_h // 4
    y2 = margin + bubble_h // 2
    y3 = margin + bubble_h * 3 // 4
    
    for y in [y1, y2]:
        draw.rounded_rectangle([lm, y - line_h, lm + bubble_w - size // 5, y + line_h], radius=line_h, fill=line_color)
    draw.rounded_rectangle([lm, y3 - line_h, lm + bubble_w // 2, y3 + line_h], radius=line_h, fill=line_color)
    
    # 尾巴
    tail_size = size // 8
    tx = margin + size // 8
    ty = margin + bubble_h
    draw.polygon([(tx, ty), (tx + tail_size, ty), (tx, ty + tail_size)], fill='white')
    
    return img

for size in [192, 512]:
    icon = create_icon(size)
    path = f'public/icons/icon-{size}.png'
    icon.save(path, 'PNG')
    print(f'✅ 生成 {path}')

print('\n图标生成完成！现在可以继续部署了。')
