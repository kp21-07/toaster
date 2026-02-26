import cv2
import os
import numpy as np

disp_scale_factor = 0.5


script_dir = os.path.dirname(os.path.abspath(__file__))
img_path = os.path.join(script_dir, r'Data/IMG_20260218_014446548.jpg')
img = cv2.imread(img_path)

def Warper(img):
    output_dim = (1440,500)
    
    offset_top,offset_right,offset_bottom,offset_left = 40,30,30,30

    dst_rect = np.array([[offset_left,offset_top],
                     [output_dim[0]-offset_right,offset_top],
                     [output_dim[0]-offset_right,output_dim[1]-offset_bottom],
                     [offset_left,output_dim[1]-offset_bottom]
                     ],dtype="float32")

    imgray = cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    imgray = cv2.GaussianBlur(imgray, (5, 5), 0)

    ret, thresh = cv2.threshold(imgray,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)
    contours,hierarchy = cv2.findContours(thresh,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)

    mask = ((hierarchy[0][:,0] == -1)  & (hierarchy[0][:,1] == -1) & (hierarchy[0][:,2] == -1))

    markers = np.where(mask)[0] 
    moments = [cv2.moments(contours[i-1]) for i in markers]
    
    areas = np.array([i['m00'] for i in moments])
    areamean = np.mean(areas)
    #filtered_markers = 

    centers = np.array([[int(i['m10']/i['m00']), int(i['m01']/i['m00'])] for i in moments])
    s = centers.sum(axis=1)

    diff = np.diff(centers, axis = 1)
    ordered_centers = np.array([
                    centers[np.argmin(s)],
                    centers[np.argmin(diff)],
                    centers[np.argmax(s)],
                    centers[np.argmax(diff)]
                    ],dtype="float32")
    # np.savetxt("Hierarchy(less_blurred).txt",hierarchy[0],"%4d")
    # np.savetxt("Filtered_contours.txt",hierarchy[0][markers],"%4d")

    cv2.drawContours(img,[contours[i-1] for i in markers],-1,(0,255,0),3)
    cv2.imshow("testimage1",cv2.resize(img,None,fx=disp_scale_factor,fy=disp_scale_factor))
    cv2.waitKey(0)

    M = cv2.getPerspectiveTransform(ordered_centers,dst_rect)
    warped = cv2.warpPerspective(img,M,output_dim)
    return warped

warped = Warper(img)


grey_code_samples = [12,30,47,65]
sample_size = 3

ret,thresh1 = cv2.threshold(cv2.cvtColor(warped,cv2.COLOR_BGR2GRAY),127,255,cv2.THRESH_BINARY)
# for i in grey_code_samples:
#     cv2.circle(thresh1,(80,i),4,(0,0,0),thickness=3)

current_code = np.zeros(4)
with open(r"codes.txt",'w+') as file:
    for i in range(50,thresh1.shape[1]-70):
        code_val = thresh1[grey_code_samples,i]/255
        if (code_val!= current_code).any():
            current_code = code_val
            file.write(str(code_val)+"\n")
            for j in grey_code_samples:
                cv2.circle(warped,(i,j),4,(0,0,0),thickness=3)
        
        #sum(int(bin(current_code)[2:]))


#cv2.drawContours(img,contours[1199],-1,(0,255,0),3)
#cv2.imshow("contours",cv2.resize(img,None,fx = disp_scale_factor,fy = disp_scale_factor))
cv2.imwrite(r"Warped_image.jpg",warped)
cv2.imshow("testimage2",warped)
cv2.waitKey(0)
cv2.destroyAllWindows()