import sys
import os
import cv2
import numpy as np
from PIL import Image

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def calculate_overall_centers():
    img = Image.open("THẤT NGHIỆP.png").convert('RGBA')
    img_arr = np.array(img)

    r, g, b, a = img_arr[:, :, 0], img_arr[:, :, 1], img_arr[:, :, 2], img_arr[:, :, 3]
    black_mask = ((r <= 10) & (g <= 10) & (b <= 10) & (a > 0)).astype(np.uint8) * 255

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(black_mask, connectivity=8)

    letter_specs = [
        # Từ THẤT
        ("THẤT", "T (chữ đầu)", [i for i in range(1, num_labels) if stats[i][0] == 324 and stats[i][1] == 154]),
        ("THẤT", "H", [i for i in range(1, num_labels) if stats[i][0] == 690 and stats[i][1] == 154]),
        ("THẤT", "Ấ", [i for i in range(1, num_labels) if stats[i][0] in (1030, 1125, 1257)]),
        ("THẤT", "T (chữ cuối)", [i for i in range(1, num_labels) if stats[i][0] == 1376 and stats[i][1] == 154]),

        # Từ NGHIỆP
        ("NGHIỆP", "N", [i for i in range(1, num_labels) if stats[i][0] == 0 and stats[i][1] == 770]),
        ("NGHIỆP", "G", [i for i in range(1, num_labels) if stats[i][0] == 362 and stats[i][1] == 763]),
        ("NGHIỆP", "H", [i for i in range(1, num_labels) if stats[i][0] == 782 and stats[i][1] == 770]),
        ("NGHIỆP", "I", [i for i in range(1, num_labels) if stats[i][0] == 1168 and stats[i][1] == 770]),
        ("NGHIỆP", "Ệ", [i for i in range(1, num_labels) if stats[i][0] in (1320, 1361, 1414)]),
        ("NGHIỆP", "P", [i for i in range(1, num_labels) if stats[i][0] == 1645 and stats[i][1] == 770]),
    ]

    letters_result = []
    all_x_list = []
    all_y_list = []

    for word, char, comp_ids in letter_specs:
        mask_char = np.isin(labels, comp_ids)
        y_indices, x_indices = np.where(mask_char)
        
        pixel_count = len(x_indices)
        all_x_list.append(x_indices)
        all_y_list.append(y_indices)
        
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
        
        cx_geo = (min_x + max_x) / 2.0
        cy_geo = (min_y + max_y) / 2.0

        letters_result.append({
            "word": word,
            "char": char,
            "pixel_count": pixel_count,
            "cx_geo": cx_geo,
            "cy_geo": cy_geo,
            "min_x": min_x, "max_x": max_x,
            "min_y": min_y, "max_y": max_y,
        })

    # Toàn bộ cả 2 từ
    all_x = np.concatenate(all_x_list)
    all_y = np.concatenate(all_y_list)

    total_min_x, total_max_x = np.min(all_x), np.max(all_x)
    total_min_y, total_max_y = np.min(all_y), np.max(all_y)

    # Trung tâm hình học của TOÀN BỘ KHỐI CHỮ "THẤT NGHIỆP"
    overall_cx = (total_min_x + total_max_x) / 2.0  # 943.5
    overall_cy = (total_min_y + total_max_y) / 2.0  # 619.0

    print("=" * 85)
    print(" BÁO CÁO TỌA ĐỘ TRUNG TÂM CỦA TOÀN BỘ CẢ 2 TỪ 'THẤT NGHIỆP'")
    print(f" GỐC TỌA ĐỘ CHUNG (0, 0) = TRUNG TÂM KHỐI CHỮ (X = {overall_cx:.1f}, Y = {overall_cy:.1f})")
    print(" QUY ƯỚC ĐỀ-CÁC: Trục X (Sang phải + / Sang trái -), Trục Y (Lên trên + / Xuống dưới -)")
    print("=" * 85)
    print(f"{'Từ':<8} | {'Chữ':<12} | {'Tổng Pixel':<12} | {'Tọa độ ảnh (X, Y)':<20} | {'Tọa độ Đề-các so với (0,0)':<30}")
    print("-" * 85)

    viz_img = img_arr.copy()
    # Vẽ gốc (0,0) chung
    cv2.drawMarker(viz_img, (int(overall_cx), int(overall_cy)), (0, 0, 255, 255), cv2.MARKER_CROSS, 50, 3)
    cv2.putText(viz_img, "GOCC (0,0) CHUNG", (int(overall_cx) - 90, int(overall_cy) - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255, 255), 2)

    total_pixels_sum = 0
    for item in letters_result:
        cx_c, cy_c = item["cx_geo"], item["cy_geo"]
        dx = cx_c - overall_cx
        dy_math = -(cy_c - overall_cy) # Lên trên là Dương

        total_pixels_sum += item["pixel_count"]

        print(f"{item['word']:<8} | {item['char']:<12} | {item['pixel_count']:>7,} px   | ({cx_c:>6.1f}, {cy_c:>6.1f}){'':<2} | (X: {dx:>+7.1f}, Y: {dy_math:>+7.1f})")

        cv2.circle(viz_img, (int(cx_c), int(cy_c)), 6, (255, 0, 0, 255), -1)
        cv2.putText(viz_img, f"{item['char']} ({dx:+.0f},{dy_math:+.0f})", (int(cx_c) - 45, int(cy_c) + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 128, 0, 255), 2)

    print("=" * 85)
    print(f"TỔNG PIXEL TẤT CẢ CÁC CHỮ: {total_pixels_sum:,} pixels")
    print("=" * 85)

    out_img = Image.fromarray(viz_img)
    out_img.save("overall_centers_labeled.png")
    print("Đã xuất ảnh minh họa tại: overall_centers_labeled.png")

if __name__ == "__main__":
    calculate_overall_centers()
