import sys
import os
import cv2
import numpy as np
from PIL import Image

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def analyze_letters(image_path="THẤT NGHIỆP.png"):
    img = Image.open(image_path)
    img_rgba = img.convert('RGBA')
    img_arr = np.array(img_rgba)

    r, g, b, a = img_arr[:, :, 0], img_arr[:, :, 1], img_arr[:, :, 2], img_arr[:, :, 3]
    
    # Binary mask of black pixels (alpha > 0 and RGB <= 10)
    black_mask = ((r <= 10) & (g <= 10) & (b <= 10) & (a > 0)).astype(np.uint8) * 255

    # Find connected components / contours
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(black_mask, connectivity=8)

    # stats columns: [LEFT, TOP, WIDTH, HEIGHT, AREA]
    components = []
    for i in range(1, num_labels):
        x, y, w, h, area = stats[i]
        if area > 10: # Filter tiny noise
            components.append({
                'id': i,
                'x': x,
                'y': y,
                'w': w,
                'h': h,
                'area': area,
                'centroid': centroids[i]
            })

    # Sort components primarily left-to-right (x), or by line if multi-line
    # Let's check y coordinates to see if single line or multiple lines
    components.sort(key=lambda c: (c['x']))

    print(f"Tổng số nét / chữ / dấu được phát hiện: {len(components)}")
    print("=" * 60)
    print(f"{'STT':<5} | {'Vị trí (x, y)':<15} | {'Kích thước (w x h)':<20} | {'Số Pixel đen':<15}")
    print("-" * 60)

    # Prepare visualization image
    viz_img = img_arr.copy()
    total_found_pixels = 0

    for idx, c in enumerate(components, 1):
        x, y, w, h, area = c['x'], c['y'], c['w'], c['h'], c['area']
        total_found_pixels += area
        print(f"{idx:<5} | ({x}, {y}){'':<6} | {w} x {h}{'':<13} | {area:,} pixels")

        # Draw bounding box on visualization image
        cv2.rectangle(viz_img, (x, y), (x + w, y + h), (255, 0, 0, 255), 2)
        cv2.putText(viz_img, str(idx), (x, max(15, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255, 255), 2)

    # Save visualization
    out_img = Image.fromarray(viz_img)
    out_img.save("letters_labeled.png")
    print("=" * 60)
    print(f"Đã lưu ảnh gắn số thứ tự chữ tại: letters_labeled.png")

if __name__ == "__main__":
    analyze_letters()
