import sys
import os
import numpy as np
from PIL import Image

# Đảm bảo stdout hỗ trợ UTF-8 trên Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def count_black_pixels(image_path, threshold=10):
    if not os.path.exists(image_path):
        print(f"Không tìm thấy file: {image_path}")
        return

    try:
        # Mở ảnh và chuyển sang dạng RGBA để kiểm tra cả độ trong suốt (Alpha)
        img = Image.open(image_path)
        img_rgba = img.convert('RGBA')
        img_arr = np.array(img_rgba)
    except Exception as e:
        print(f"Lỗi khi mở ảnh: {e}")
        return

    height, width, _ = img_arr.shape
    total_pixels = width * height

    # Tách kênh màu
    r = img_arr[:, :, 0]
    g = img_arr[:, :, 1]
    b = img_arr[:, :, 2]
    a = img_arr[:, :, 3]

    # Đếm pixel đen tối thiểu (chỉ tính pixel không hoàn toàn trong suốt - alpha > 0)
    visible_mask = a > 0
    visible_pixels = np.sum(visible_mask)

    # Đen tuyệt đối (R=0, G=0, B=0, Alpha > 0)
    exact_black_mask = (r == 0) & (g == 0) & (b == 0) & visible_mask
    exact_black_count = np.sum(exact_black_mask)

    # Gần như đen (R <= threshold, G <= threshold, B <= threshold, Alpha > 0)
    near_black_mask = (r <= threshold) & (g <= threshold) & (b <= threshold) & visible_mask
    near_black_count = np.sum(near_black_mask)

    print(f"--- THÔNG TIN ẢNH ---")
    print(f"Tên file ảnh: {image_path}")
    print(f"Kích thước: {width} x {height} ({total_pixels:,} pixels tổng cộng)")
    print(f"Số pixel hiển thị được (Alpha > 0): {visible_pixels:,}")
    print(f"----------------------")
    print(f"1. Pixel đen tuyệt đối (RGB = 0, 0, 0):")
    print(f"   - Số lượng: {exact_black_count:,} pixels")
    print(f"   - Tỷ lệ / Tổng pixel: {exact_black_count / total_pixels * 100:.2f}%")
    if visible_pixels > 0:
        print(f"   - Tỷ lệ / Pixel không trong suốt: {exact_black_count / visible_pixels * 100:.2f}%")
    print()
    print(f"2. Pixel gần đen (Mỗi kênh R, G, B <= {threshold}):")
    print(f"   - Số lượng: {near_black_count:,} pixels")
    print(f"   - Tỷ lệ / Tổng pixel: {near_black_count / total_pixels * 100:.2f}%")

if __name__ == "__main__":
    img_path = sys.argv[1] if len(sys.argv) > 1 else "THẤT NGHIỆP.png"
    thresh = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    count_black_pixels(img_path, thresh)

