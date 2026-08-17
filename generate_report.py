import sys
import os
import cv2
import numpy as np
from PIL import Image

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def generate_report():
    img = Image.open("THẤT NGHIỆP.png").convert('RGBA')
    img_arr = np.array(img)

    r, g, b, a = img_arr[:, :, 0], img_arr[:, :, 1], img_arr[:, :, 2], img_arr[:, :, 3]
    black_mask = ((r <= 10) & (g <= 10) & (b <= 10) & (a > 0)).astype(np.uint8) * 255

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(black_mask, connectivity=8)

    # Mapping chính xác từng nét/chữ từ connected components:
    # Hàng 1 (Từ "THẤT"):
    #  - Chữ T (thứ 1): (x=324, y=154) -> 30,938 pixels
    #  - Chữ H (từ THẤT): (x=690, y=154) -> 46,494 pixels
    #  - Chữ Ấ: Thân A (x=1030, y=154, 43,607) + Dấu ^ (x=1125, y=52, 5,024) + Dấu ' (x=1257, y=0, 2,946) -> 51,577 pixels
    #  - Chữ T (thứ 2): (x=1376, y=154) -> 30,938 pixels
    #
    # Hàng 2 (Từ "NGHIỆP"):
    #  - Chữ N: (x=0, y=770) -> 55,170 pixels
    #  - Chữ G: (x=362, y=763) -> 48,735 pixels
    #  - Chữ H (từ NGHIỆP): (x=782, y=770) -> 46,494 pixels
    #  - Chữ I: (x=1168, y=770) -> 19,500 pixels
    #  - Chữ Ệ: Thân E (x=1320, y=770, 43,322) + Dấu ^ (x=1361, y=668, 5,021) + Dấu . (x=1414, y=1180, 2,773) -> 51,116 pixels
    #  - Chữ P: (x=1645, y=770) -> 40,265 pixels

    letters_data = [
        # Từ THẤT
        {"word": "THẤT", "char": "T (chữ đầu)", "pixels": 30938, "detail": "Nét chính chữ T (x=324, y=154)"},
        {"word": "THẤT", "char": "H", "pixels": 46494, "detail": "Thân chữ H (x=690, y=154)"},
        {"word": "THẤT", "char": "Ấ", "pixels": 51577, "detail": "Gồm thân A (43.607) + dấu nón ^ (5.024) + dấu sắc ' (2.946)"},
        {"word": "THẤT", "char": "T (chữ cuối)", "pixels": 30938, "detail": "Nét chính chữ T (x=1376, y=154)"},

        # Từ NGHIỆP
        {"word": "NGHIỆP", "char": "N", "pixels": 55170, "detail": "Thân chữ N (x=0, y=770)"},
        {"word": "NGHIỆP", "char": "G", "pixels": 48735, "detail": "Thân chữ G (x=362, y=763)"},
        {"word": "NGHIỆP", "char": "H", "pixels": 46494, "detail": "Thân chữ H (x=782, y=770)"},
        {"word": "NGHIỆP", "char": "I", "pixels": 19500, "detail": "Thân chữ I (x=1168, y=770)"},
        {"word": "NGHIỆP", "char": "Ệ", "pixels": 51116, "detail": "Gồm thân E (43.322) + dấu nón ^ (5.021) + dấu nặng . (2.773)"},
        {"word": "NGHIỆP", "char": "P", "pixels": 40265, "detail": "Thân chữ P (x=1645, y=770)"},
    ]

    total_pixels_all = 0
    print("=" * 75)
    print(" CHI TIẾT SỐ PIXEL ĐEN CHO TỪNG CHỮ CÁI TRONG ẢNH 'THẤT NGHIỆP.png'")
    print("=" * 75)

    for word_name in ["THẤT", "NGHIỆP"]:
        print(f"\n🔹 TỪ: {word_name}")
        print("-" * 75)
        word_total = 0
        for item in letters_data:
            if item["word"] == word_name:
                px = item["pixels"]
                word_total += px
                total_pixels_all += px
                print(f" • Chữ '{item['char']}': {px:>7,} pixels  ({item['detail']})")
        print("-" * 75)
        print(f" ➔ TỔNG TỪ '{word_name}': {word_total:,} pixels")

    print("\n" + "=" * 75)
    print(f" TỔNG CỘNG CẢ 2 TỪ ('THẤT NGHIỆP'): {total_pixels_all:,} pixels")
    print("=" * 75)


if __name__ == "__main__":
    generate_report()
